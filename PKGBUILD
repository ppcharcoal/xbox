# Maintainer: ppcharcoal
# Build & install from a clone of this repo:  makepkg -si

pkgname=xbox-play
pkgver=1.6.0
pkgrel=1
pkgdesc="Xbox Remote Play for Wayland (Hyprland) with Better xCloud: auto-connect, Xbox button, mouse & keyboard mapping"
arch=('any')
url="https://github.com/ppcharcoal/xbox"
license=('MIT')
depends=('electron' 'sh')
optdepends=(
  'libva-mesa-driver: hardware video decoding on AMD (xbox-play --vaapi)'
  'intel-media-driver: hardware video decoding on Intel (xbox-play --vaapi)'
  'libva-nvidia-driver: hardware video decoding on NVIDIA (xbox-play --vaapi)'
)
source=(
  'main.js'
  'preload.js'
  'lib.js'
  'page-input.js'
  'editor.html'
  'editor.js'
  'editor-preload.js'
  'package.json'
  'xbox-play.sh'
  'xbox-play.desktop'
  'xbox-play.svg'
  'LICENSE'
  # Bundled copy only; the app downloads newer releases itself at runtime.
  'better-xcloud.user.js::https://github.com/redphx/better-xcloud/releases/latest/download/better-xcloud.user.js'
)
sha256sums=('SKIP' 'SKIP' 'SKIP' 'SKIP' 'SKIP' 'SKIP' 'SKIP' 'SKIP' 'SKIP' 'SKIP' 'SKIP' 'SKIP' 'SKIP')

check() {
  head -n 3 better-xcloud.user.js | grep -q '@name *Better xCloud' \
    || { echo "Downloaded Better xCloud script looks wrong"; return 1; }
}

package() {
  local app="$pkgdir/usr/lib/$pkgname"
  install -Dm644 -t "$app" main.js preload.js lib.js page-input.js editor.html editor.js editor-preload.js \
    package.json better-xcloud.user.js
  install -Dm755 xbox-play.sh "$pkgdir/usr/bin/xbox-play"
  install -Dm644 xbox-play.desktop "$pkgdir/usr/share/applications/xbox-play.desktop"
  install -Dm644 xbox-play.svg "$pkgdir/usr/share/icons/hicolor/scalable/apps/xbox-play.svg"
  install -Dm644 LICENSE "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
}
