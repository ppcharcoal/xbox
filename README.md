# Xbox

Obraz z Xboxa na ekranie komputera z **karty przechwytującej HDMI** (USB, UVC), z dźwiękiem
i jak najmniejszym opóźnieniem. Na Linuksie (Arch, Wayland, Hyprland).

- sam znajduje kartę (pomija kamerki internetowe) i wybiera najlepszy tryb:
  1920×1080 przy najwyższej liczbie klatek, przy równej liczbie klatek obraz nieskompresowany
- obraz przez `mpv` w trybie najmniejszego opóźnienia, prosto z karty
- dźwięk z karty na domyślnym wyjściu (PipeWire), osobno od obrazu, żeby nie opóźniał
- pełny ekran, ekran nie gaśnie podczas grania
- `xbox --toggle` otwiera i zamyka okno (pod skrót klawiszowy)

Pad łączy się bezpośrednio z Xboxem, więc działa normalnie. Mysz i klawiaturę dla Xboxa
podłącza się do konsoli (np. przez przełącznik USB), bo karta przesyła tylko obraz i dźwięk.

## Instalacja (Arch)

```bash
git clone https://github.com/ppcharcoal/xbox && cd xbox && makepkg -si
```

Aktualizacja: `cd xbox && git pull && makepkg -si`.

## Podłączenie

```
Xbox ─HDMI─► karta (HDMI IN) ─USB 3─► komputer
                 └─ HDMI OUT ─► telewizor (opcjonalnie)
```

- Kartę podłącz **bezpośrednio do portu USB 3 w komputerze**, nie przez hub (na hubie może
  działać tylko jako USB 2.0 albo zrywać inne urządzenia).
- Na Xboxie: **Ustawienia → Ogólne → Opcje TV i wyświetlania**:
  - rozdzielczość **1080p**, odświeżanie **60 Hz** (albo 120 Hz, jeśli karta przechwytuje 1080p120),
  - **Wierność wideo → wyłącz „Zezwalaj na HDCP”**, inaczej obraz będzie czarny
    (gry działają normalnie, nie działają tylko aplikacje typu Netflix).

## Używanie

```bash
xbox                # otwórz (pełny ekran)
xbox --windowed     # w oknie
xbox --toggle       # otwórz / zamknij
xbox --list         # wykryte karty, ich tryby i źródło dźwięku
xbox --format MJPG  # wymuś format obrazu (MJPG albo YUYV)
```

W oknie: **f** pełny ekran, **Esc** wyjście z pełnego ekranu, **q** zamknij.

## Ustawienia

`xbox --config` tworzy `~/.config/xbox/config.json`:

| Opcja | Znaczenie |
|---|---|
| `device` | np. `/dev/video0`; puste = automatycznie |
| `width`, `height` | rozmiar obrazu (1920×1080) |
| `fps` | 0 = najwyższa dostępna |
| `format` | puste = automatycznie, albo `MJPG` / `YUYV` |
| `fullscreen` | start w pełnym ekranie |
| `audio` | dźwięk z karty |
| `audio_source` | inne źródło PipeWire; puste = wejście karty |
| `audio_latency_ms` | opóźnienie dźwięku (25 ms) |
| `mpv_args` | dodatkowe opcje mpv |

## Gdy coś nie działa

- **„Nie widzę karty”**: `xbox --list`; sprawdź, czy karta jest w porcie USB 3, a kabel przesyła dane.
- **Czarny obraz**: wyłącz HDCP na Xboxie (wyżej).
- **„Karta jest zajęta”**: zamknij OBS albo inny program, który z niej korzysta.
- **Brak dźwięku**: `xbox --list` pokazuje źródło dźwięku; jeśli „not found”, sprawdź
  `pactl list short sources` i wpisz nazwę do `audio_source`.

## Testy

```bash
python -m unittest discover -s tests
```

## Licencja

MIT. Projekt niezwiązany z Microsoftem; „Xbox” to znak towarowy Microsoftu.
