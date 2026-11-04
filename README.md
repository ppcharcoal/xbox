# Xbox Play

Xbox **Remote Play** (gra z własnej konsoli) na Linuksie w osobnym oknie, dopracowane pod
**Wayland / Hyprland**. To lekka nakładka na systemowy Electron, która otwiera Remote Play z
`xbox.com` z wbudowanym [Better xCloud](https://github.com/redphx/better-xcloud).

- 🎮 tylko Remote Play: start od razu na Twojej konsoli, bez strony Cloud Gaming
- 🔁 automatyczne łączenie z ostatnio używaną konsolą
- 🕹️ pad Xbox (USB / Bluetooth / adapter), **łącznie z przyciskiem Xbox**
- ⌨️ **mysz i klawiatura** zamieniane na pada (mapowanie do edycji)
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
  więc nie zależy od tego, czy przeglądarka go widzi. Krótkie naciśnięcie otwiera przewodnik
  na konsoli.
- **F9** robi to samo z klawiatury (przytrzymanie = przytrzymanie przycisku Xbox).
- W trybie myszy i klawiatury przycisk Xbox jest też pod klawiszem **`** (pod Esc).
- **Ctrl+Shift+G** otwiera test pada (przycisk Xbox to nr 16).

## Mysz i klawiatura

Remote Play od Microsoftu nie przyjmuje myszy i klawiatury, więc aplikacja zamienia je na pada
(mapper z Better xCloud):

1. W trakcie gry naciśnij **F8** i kliknij w obraz, żeby złapać kursor.
2. Mysz = prawa gałka, lewy/prawy przycisk myszy = RT/LT, WASD = lewa gałka, Spacja = A,
   Enter = Menu, Tab = View, **`** = Xbox (pełna lista i edycja w ustawieniach).
3. **Przytrzymaj Esc ~1 s**, żeby zwolnić kursor; **F8** wyłącza tryb.

Mapowanie zmienisz w: fioletowy przycisk **Better xCloud** → **Mysz i klawiatura** (presety
"Standard" i "Shooter" albo własny), tam też czułość myszy.

> Better xCloud ostrzega, że celowanie myszą w grach online może być traktowane jak oszukiwanie.

## Skróty

| Klawisz | Akcja |
|---|---|
| **F11** | pełny ekran |
| **F9** | przycisk Xbox |
| **F8** | mysz i klawiatura jako pad (włącz/wyłącz) |
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
  "startUrl": "https://www.xbox.com/play",
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

- `startUrl` jest używany tylko przy `"remotePlayOnly": false`.
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
