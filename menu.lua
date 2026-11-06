-- Xbox: settings menu over the picture (Ctrl+Shift+M) and Ctrl+F for fullscreen.
-- The launcher writes the card's modes to a small JSON file and passes its path as
-- --script-opts=xbox-state=<path>. Choosing a mode reopens the card in the same window
-- and saves the choice to the config file.

local mp = require "mp"
local utils = require "mp.utils"

local opts = { state = "" }
require("mp.options").read_options(opts, "xbox")

local state = nil
local function load_state()
    if state or opts.state == "" then return state end
    local f = io.open(opts.state, "r")
    if not f then return nil end
    local text = f:read("*a")
    f:close()
    state = utils.parse_json(text)
    return state
end

-- ------------------------------------------------------------------ config file

local function save_config(changes)
    local s = load_state()
    if not s or not s.config_path then return end
    local cfg = {}
    local f = io.open(s.config_path, "r")
    if f then
        cfg = utils.parse_json(f:read("*a")) or {}
        f:close()
    end
    for k, v in pairs(changes) do cfg[k] = v end
    local out = io.open(s.config_path, "w")
    if out then
        out:write(utils.format_json(cfg), "\n")
        out:close()
    end
end

-- ------------------------------------------------------------------ modes

local function mode_label(m)
    return string.format("%s  %dx%d  %s kl./s", m[1], m[2], m[3], tostring(m[4]):gsub("%.0+$", ""))
end

local function same_mode(a, b)
    return a and b and a[1] == b[1] and a[2] == b[2] and a[3] == b[3] and a[4] == b[4]
end

local function apply_mode(m, auto)
    local s = load_state()
    if not s then return end
    local fps = tostring(m[4]):gsub("%.0+$", "")
    local lavf = string.format("video_size=%dx%d,framerate=%s,input_format=%s,fflags=+nobuffer",
        m[2], m[3], fps, m[5])
    mp.set_property("demuxer-lavf-o", lavf)
    mp.commandv("loadfile", s.url, "replace")
    s.current = m
    s.auto = auto
    if auto then
        save_config({ format = "", fps = 0, width = 1920, height = 1080 })
    else
        save_config({ format = m[1], fps = math.floor(m[4] + 0.5), width = m[2], height = m[3] })
    end
    mp.osd_message((auto and "Automatycznie: " or "Tryb: ") .. mode_label(m), 2)
end

-- ------------------------------------------------------------------ menu

local overlay = mp.create_osd_overlay("ass-events")
overlay.res_x, overlay.res_y = 1920, 1080
local menu_open = false
local items = {}
local selected = 1
local VISIBLE = 14

local function build_items()
    local s = load_state()
    items = {}
    local fs = mp.get_property_bool("fullscreen")
    table.insert(items, {
        label = "Pełny ekran: " .. (fs and "włączony" or "wyłączony"),
        run = function()
            local now = not mp.get_property_bool("fullscreen")
            mp.set_property_bool("fullscreen", now)
            save_config({ fullscreen = now })
        end,
    })
    if s and s.modes then
        table.insert(items, {
            label = "Automatycznie (najlepszy tryb)",
            current = s.auto,
            run = function() if s.best then apply_mode(s.best, true) end end,
        })
        for _, m in ipairs(s.modes) do
            table.insert(items, {
                label = mode_label(m),
                current = (not s.auto) and same_mode(m, s.current),
                run = function() apply_mode(m, false) end,
            })
        end
    end
end

local function ass_escape(text)
    return (text:gsub("\\", "\\\\"):gsub("{", "\\{"):gsub("}", "\\}"))
end

local function render()
    if not menu_open then
        overlay:remove()
        return
    end
    local first = math.max(1, math.min(selected - math.floor(VISIBLE / 2), #items - VISIBLE + 1))
    local last = math.min(#items, first + VISIBLE - 1)
    local rows = last - first + 1
    local x, y, w, line = 60, 60, 640, 44
    local h = 110 + rows * line + 50
    local ass = {}
    -- panel
    table.insert(ass, string.format("{\\an7\\pos(%d,%d)\\bord0\\shad0\\1c&H1A1A1A&\\1a&H30&\\p1}m 0 0 l %d 0 l %d %d l 0 %d{\\p0}",
        x, y, w, w, h, h))
    table.insert(ass, string.format("{\\an7\\pos(%d,%d)\\bord0\\shad0\\fs34\\b1\\1c&HFFFFFF&}Ustawienia obrazu",
        x + 28, y + 24))
    for i = first, last do
        local item = items[i]
        local ty = y + 90 + (i - first) * line
        if i == selected then
            table.insert(ass, string.format("{\\an7\\pos(%d,%d)\\bord0\\shad0\\1c&H47BFFF&\\1a&H00&\\p1}m 0 0 l %d 0 l %d %d l 0 %d{\\p0}",
                x + 16, ty - 4, w - 32, w - 32, line - 4, line - 4))
        end
        local color = i == selected and "1D2230" or "EEF1F7"
        local mark = item.current and "● " or "   "
        table.insert(ass, string.format("{\\an7\\pos(%d,%d)\\bord0\\shad0\\fs28\\1c&H%s&}%s%s",
            x + 30, ty, color, mark, ass_escape(item.label)))
    end
    table.insert(ass, string.format("{\\an7\\pos(%d,%d)\\bord0\\shad0\\fs22\\1c&HA0A8B8&}↑ ↓ wybór   Enter zatwierdź   Esc zamknij",
        x + 28, y + h - 42))
    overlay.data = table.concat(ass, "\n")
    overlay:update()
end

local menu_keys = {}

local function close_menu()
    menu_open = false
    for _, name in ipairs(menu_keys) do mp.remove_key_binding(name) end
    menu_keys = {}
    render()
end

local function bind(key, name, fn, repeatable)
    mp.add_forced_key_binding(key, name, fn, { repeatable = repeatable })
    table.insert(menu_keys, name)
end

local function move(delta)
    if #items == 0 then return end
    selected = (selected - 1 + delta) % #items + 1
    render()
end

local function open_menu()
    build_items()
    selected = 1
    for i, item in ipairs(items) do
        if item.current then selected = i end
    end
    menu_open = true
    bind("UP", "xbox-menu-up", function() move(-1) end, true)
    bind("DOWN", "xbox-menu-down", function() move(1) end, true)
    bind("WHEEL_UP", "xbox-menu-wheel-up", function() move(-1) end)
    bind("WHEEL_DOWN", "xbox-menu-wheel-down", function() move(1) end)
    local function choose()
        local item = items[selected]
        close_menu()
        if item then item.run() end
    end
    bind("ENTER", "xbox-menu-enter", choose)
    bind("KP_ENTER", "xbox-menu-kp-enter", choose)
    bind("ESC", "xbox-menu-esc", close_menu)
    render()
end

local function toggle_menu()
    if menu_open then close_menu() else open_menu() end
end

-- Ctrl+Shift+M (mpv names it Ctrl+M; both spellings are bound)
mp.add_forced_key_binding("Ctrl+M", "xbox-menu", toggle_menu)
mp.add_forced_key_binding("Ctrl+Shift+m", "xbox-menu-shift", toggle_menu)
mp.add_forced_key_binding("Ctrl+f", "xbox-fullscreen", function() mp.commandv("cycle", "fullscreen") end)

mp.observe_property("fullscreen", "bool", function()
    if menu_open then
        build_items()
        render()
    end
end)

-- for tests: report what the menu shows
mp.register_script_message("xbox-menu-dump", function()
    local labels = {}
    for i, item in ipairs(items) do
        labels[#labels + 1] = (i == selected and ">" or " ") .. (item.current and "*" or " ") .. item.label
    end
    mp.set_property("user-data/xbox-menu", utils.format_json({ open = menu_open, items = labels }))
end)
