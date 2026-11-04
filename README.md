# Xbox Play

Xbox **Remote Play** (gra z własnej konsoli) na Linuksie w osobnym oknie, dopracowane pod
**Wayland / Hyprland**. To lekka nakładka na systemowy Electron, która otwiera Remote Play z
`xbox.com` z wbudowanym [Better xCloud](https://github.com/redphx/better-xcloud).

- 🎮 tylko Remote Play: start od razu na Twojej konsoli, bez strony Cloud Gaming
- 🔁 automatyczne łączenie z ostatnio używaną konsolą
- 🕹️ pad Xbox (USB / Bluetooth / adapter), **łącznie z przyciskiem Xbox** (także przytrzymaniem)
- ⌨️ **mysz i klawiatura** zamieniane na pada przez wbudowany mapper (F8)
- 📺 1080p (HQ), user agent Edge (najlepsza jakość od Microsoftu)
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

## Jak to działa

1. Na Xboxie: **Ustawienia → Urządzenia i połączenia → Funkcje zdalne → Włącz funkcje zdalne**.
2. Uruchom **Xbox Play** z menu aplikacji albo komendą `xbox-play`.
3. Zaloguj się kontem Microsoft (tym samym co na konsoli).
4. Wybierz konsolę i **Graj zdalnie na tym urządzeniu**.

Od tej pory aplikacja **przy każdym starcie łączy się od razu z tą konsolą**. Gdy zakończysz
grę albo połączenie się nie uda, wracasz na listę konsol (nigdy na Cloud Gaming).
Listę konsol otworzysz też w każdej chwili przez **Ctrl+Shift+C** albo `xbox-play --pick`.

> Włączaj Xboxa przyciskiem na konsoli, nie padem: pad włączony przy konsoli łączy się z nią,
> a nie z komputerem.

## Przycisk Xbox

- **Przycisk Xbox na padzie** działa: aplikacja czyta go bezpośrednio z pada (`/dev/input`),
  więc nie zależy od tego, czy przeglądarka go widzi.
- **Krótkie naciśnięcie** otwiera przewodnik, **przytrzymanie** (dłużej niż pół sekundy) jest
  przekazywane do konsoli jako prawdziwe przytrzymanie (np. menu zasilania).
- **F9** robi to samo z klawiatury, a w trybie myszy i klawiatury także klawisz **`** (pod Esc).
- **Ctrl+Shift+G** otwiera test pada (przycisk Xbox to nr 16).

## Mysz i klawiatura

Remote Play od Microsoftu nie przyjmuje myszy i klawiatury, więc aplikacja ma własny mapper,
który zamienia je na pada (działa razem z prawdziwym padem albo zamiast niego):

1. W trakcie gry naciśnij **F8** (pojawi się komunikat u góry ekranu).
2. **Kliknij w obraz**, żeby złapać kursor: mysz steruje prawą gałką.
3. **Esc** zwalnia kursor, **F8** wyłącza mapper.

| Klawisz | Pad | | Klawisz | Pad |
|---|---|---|---|---|
| W A S D | lewa gałka | | mysz | prawa gałka |
| I J K L | prawa gałka | | ← ↑ → ↓ / 1 2 3 4 | krzyżak |
| Spacja, E | A | | C, Backspace | B |
| R | X | | V | Y |
| Q | LB | | F | RB |
| prawy przycisk myszy | LT | | lewy przycisk myszy | RT |
| Shift, X | L3 | | Z, środkowy przycisk | R3 |
| Tab | View | | Enter | Menu |
| **`** | Xbox | | | |

### Edytor sterowania i profile

**Ctrl+Shift+M** (albo w menu aplikacji: *Xbox Play → Sterowanie*, albo `xbox-play --editor`)
otwiera edytor:

- kliknij przycisk na rysunku pada albo na liście i naciśnij klawisz, przycisk myszy
  (także boczne) albo przekręć **kółko myszy** (Esc anuluje); najedź na klawisz i kliknij **×**,
  żeby go usunąć,
- **kilka klawiszy na jeden przycisk**: kliknij **+** przy przycisku i dodaj kolejny klawisz,
- **jeden klawisz na kilka przycisków naraz** (np. LB+RB): przypisz ten sam klawisz do kolejnego
  przycisku; na klawiszu pojawi się znacznik **+1**,
- **akceleracja** (szybszy ruch ręki obraca kamerę ponad proporcję; 0 = wyłączona),
- **martwa strefa gry**: każdy ruch myszy zaczyna od tej wartości, żeby małe ruchy nie ginęły
  w martwej strefie gałki w grze (0 = zwykła gałka; domyślnie 20%),
- suwak **czułość myszy**, **wygładzanie** (kamera płynnie podąża za ręką jak kursor na
  komputerze, zamiast skakać jak gałka; domyślnie włączone) i **odwróć oś Y**,
- **profile**, np. osobny dla każdej gry: *Nowy profil*, *Duplikuj*, *Zmień nazwę*, *Usuń*,
  *Przywróć domyślne*,
- zmiany zapisują się same i działają od razu w grze, bez odświeżania,
- **F7** w grze przełącza na następny profil (nazwa pojawia się na ekranie).

Klawisze zajęte przez aplikację (F5, F7, F8, F9, F11, F12, Esc) nie mogą być przypisane.
Profile są zapisane w `~/.config/xbox-play/mappings.json`.

> Celowanie myszą w grach online może być traktowane jak oszukiwanie.

## Skróty

| Klawisz | Akcja |
|---|---|
| **F11** | pełny ekran |
| **F9** | przycisk Xbox |
| **F8** | mysz i klawiatura jako pad (włącz/wyłącz) |
| **F7** | następny profil sterowania |
| **Ctrl+Shift+M** | edytor sterowania |
| **Ctrl+Shift+C** | lista konsol |
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
| `--pick` | pokaż listę konsol zamiast łączyć się automatycznie |
| `--editor` | otwórz edytor sterowania |
| `--cloud` | wyłącz tryb „tylko Remote Play” (Cloud Gaming dostępny) |
| `--url=https://…` | inna strona startowa |
| `--vaapi` | sprzętowe dekodowanie wideo (VA-API) |
| `--no-bx` | bez Better xCloud |

Plik `~/.config/xbox-play/config.json` (tworzony przy pierwszym starcie; brakujące klucze
mają wartości domyślne):

```json
{
  "remotePlayOnly": true,
  "autoConnect": true,
  "fullscreen": false,
  "betterXcloud": true,
  "autoUpdateBetterXcloud": true,
  "userAgent": "edge-windows",
  "vaapi": false,
  "hideScrollbars": true,
  "mapper": true,
  "startUrl": "https://www.xbox.com/play",
  "betterXcloudDefaults": {
    "stream.video.resolution": "1080p-hq",
    "xhome.video.resolution": "1080p-hq",
    "block.tracking": true,
    "ui.feedbackDialog.disabled": true,
    "ui.hideScrollbar": true
  }
}
```

- `startUrl` jest używany tylko przy `"remotePlayOnly": false`.
- Sterowanie myszą i klawiaturą ustawiasz w edytorze (Ctrl+Shift+M), nie w tym pliku.
- Ostatnia konsola jest zapisana w `~/.config/xbox-play/state.json` (usuń plik, żeby ją zapomnieć).
- `betterXcloudDefaults` są ustawiane tylko raz, jeśli sam ich nie zmieniłeś w Better xCloud.
- Dodatkowe flagi Chromium: `~/.config/xbox-play-flags.conf` (jedna na linię).

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
