# Xbox Play

Xbox **Remote Play** (gra z własnej konsoli) i **Cloud Gaming** na Linuksie w osobnym oknie,
dopracowane pod **Wayland / Hyprland**. To lekka nakładka na systemowy Electron, która otwiera
`xbox.com/play` z wbudowanym [Better xCloud](https://github.com/redphx/better-xcloud).

- 🎮 pad Xbox (USB / Bluetooth / adapter) działa od razu
- 🖱️ **mysz i klawiatura**: emulacja pada (Better xCloud) + natywna obsługa w grach, które ją mają
- 📺 1080p (HQ) w Remote Play i xCloud, user agent Edge (najlepsza jakość od Microsoftu)
- 🪟 natywny Wayland, pełny ekran, ekran nie gaśnie podczas grania (działa z `hypridle`)
- 🔄 Better xCloud aktualizuje się sam przy starcie
- 🔒 logowanie Microsoft zostaje zapamiętane; obce linki otwierają się w zwykłej przeglądarce

## Instalacja (Arch)

```bash
git clone https://github.com/ppcharcoal/xbox && cd xbox && makepkg -si
```

Aktualizacja:

```bash
cd xbox && git pull && makepkg -si
```

Odinstalowanie: `sudo pacman -R xbox-play` (ustawienia i logowanie zostają w `~/.config/xbox-play`).

## Pierwsze uruchomienie

1. Na Xboxie: **Ustawienia → Urządzenia i połączenia → Funkcje zdalne → Włącz funkcje zdalne**.
2. Uruchom **Xbox Play** z menu aplikacji albo komendą `xbox-play`.
3. Zaloguj się kontem Microsoft (tym samym co na konsoli).
4. Kliknij przycisk **Remote Play** w górnym pasku (dodaje go Better xCloud) i wybierz konsolę.
   Możesz też od razu otwierać listę konsol: `xbox-play --remote-play`.

## Mysz i klawiatura

Są dwa tryby (ustawienia: przycisk **Better xCloud** w górnym pasku):

| Tryb | Jak działa | Kiedy |
|---|---|---|
| **Emulacja pada** (włączona domyślnie) | mysz = prawa gałka, klawisze = przyciski pada; mapowanie zmienisz w ustawieniach | Remote Play i Cloud Gaming, każda gra |
| **Natywna obsługa** | gra dostaje prawdziwą mysz i klawiaturę | tylko Cloud Gaming (xCloud), w grach, które to wspierają |

W **Remote Play** Better xCloud wyłącza natywną mysz i klawiaturę, więc działa tylko emulacja.
Po rozpoczęciu gry:

- **F8**: włącz/wyłącz emulację myszy i klawiatury (potem kliknij w obraz, żeby złapać kursor)
- **przytrzymaj Esc ~1 s**: zwolnij kursor

### Przycisk Xbox

Jeśli przycisk Xbox na padzie nie działa w grze, naciśnij **F9**: aplikacja wyśle wciśnięcie
przycisku Xbox prosto do konsoli. **Ctrl+Shift+G** otwiera test pada: przycisk Xbox to nr 16.
Jeśli się nie podświetla, przeglądarka go po prostu nie dostaje od sterownika.

> Better xCloud ostrzega, że emulacja myszy w grach online może być traktowana jak oszukiwanie.

## Skróty

| Klawisz | Akcja |
|---|---|
| **F11** | pełny ekran |
| **F9** | przycisk Xbox (przewodnik) w trakcie gry |
| **F8** | emulacja myszy i klawiatury (Better xCloud) |
| **Ctrl+Shift+G** | test pada |
| **F5 / Ctrl+R** | odśwież |
| **Ctrl+Shift+U** | wymuś aktualizację Better xCloud i odśwież |
| **Alt+←/→** | wstecz / dalej |
| **F12** | narzędzia deweloperskie |
| **Ctrl+Q** | zamknij |

## Hyprland

Klasa okna (`app_id`) to `xbox-play`. Przykład do `hyprland.conf`:

```ini
# Super+X: Xbox na pełnym ekranie na workspace 9
bind = SUPER, X, exec, [workspace 9] uwsm app -- xbox-play --fullscreen
```

Bez uwsm: `bind = SUPER, X, exec, [workspace 9] xbox-play --fullscreen`.
Ponowne wywołanie nie otwiera drugiego okna, tylko przełącza na istniejące.

## Opcje

Linia poleceń:

| Opcja | Działanie |
|---|---|
| `--fullscreen` / `--windowed` | start w pełnym ekranie / w oknie |
| `--remote-play` | otwórz od razu listę konsol |
| `--url=https://…` | inna strona startowa |
| `--vaapi` | sprzętowe dekodowanie wideo (VA-API) |
| `--no-bx` | bez Better xCloud |

Plik `~/.config/xbox-play/config.json` (tworzony przy pierwszym starcie):

```json
{
  "startUrl": "https://www.xbox.com/play",
  "fullscreen": false,
  "betterXcloud": true,
  "autoUpdateBetterXcloud": true,
  "userAgent": "edge-windows",
  "vaapi": false,
  "hideScrollbars": true,
  "betterXcloudDefaults": {
    "mkb.enabled": true,
    "stream.video.resolution": "1080p-hq",
    "xhome.video.resolution": "1080p-hq",
    "block.tracking": true,
    "ui.feedbackDialog.disabled": true,
    "ui.hideScrollbar": true
  }
}
```

`betterXcloudDefaults` są ustawiane tylko raz, jeśli sam ich nie zmieniłeś w ustawieniach
Better xCloud. Dodatkowe flagi Chromium możesz wpisać do `~/.config/xbox-play-flags.conf`
(jedna na linię).

### VA-API

Domyślnie wideo dekoduje procesor: 1080p60 H.264 to dla niego niewielkie obciążenie i zwykle
daje najmniejsze opóźnienie. Jeśli chcesz odciążyć CPU, zainstaluj sterownik VA-API swojej karty
(`libva-mesa-driver` dla AMD) i uruchom z `--vaapi` albo ustaw `"vaapi": true`. Jeśli obraz
będzie czarny albo migał, wróć do `false`.

## Ograniczenia

- Remote Play od Microsoftu to maksymalnie **1080p i 60 fps** (120 fps tylko z kartą przechwytującą).
- Opóźnienie zależy od sieci: Xbox i PC najlepiej podłączyć kablem.
- Pad musi być połączony z **komputerem**, nie z konsolą.

## Licencja

MIT. Better xCloud © redphx, licencja MIT; projekt niezwiązany z Microsoftem.
