# Maintainer: ppcharcoal
# Build & install from a clone of this repo:  makepkg -si

pkgname=xbox
pkgver=2.0.2
pkgrel=1
pkgdesc="The Xbox on the PC screen from an HDMI capture card, with low latency and sound"
arch=('any')
url="https://github.com/ppcharcoal/xbox"
license=('MIT')
depends=('python' 'mpv' 'v4l-utils' 'pipewire')
optdepends=('libnotify: messages when the capture card is missing or busy')
conflicts=('xbox-play')
replaces=('xbox-play')
source=('xbox' 'xbox.desktop' 'xbox.svg' 'LICENSE')
sha256sums=('SKIP' 'SKIP' 'SKIP' 'SKIP')

check() {
  # The tests live next to this PKGBUILD in the repo clone.
  cd "$startdir"
  python -m unittest discover -s tests
}

package() {
  install -Dm755 xbox "$pkgdir/usr/bin/xbox"
  install -Dm644 xbox.desktop "$pkgdir/usr/share/applications/xbox.desktop"
  install -Dm644 xbox.svg "$pkgdir/usr/share/icons/hicolor/scalable/apps/xbox.svg"
  install -Dm644 LICENSE "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
}
