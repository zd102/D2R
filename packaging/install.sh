#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo: sudo bash install.sh' >&2; exit 1; }
command -v systemctl >/dev/null
[[ $(uname -m) == x86_64 ]] || { echo 'This package requires Linux x64.' >&2; exit 1; }
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
"$source_dir/runtime/node" --version
version=$("$source_dir/runtime/node" -p "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).version" "$source_dir/package.json")
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid package version' >&2; exit 1; }
id d2r-server >/dev/null 2>&1 || useradd --system --home-dir /var/lib/d2r-server --shell /usr/sbin/nologin d2r-server
install -d -m 755 /opt/d2r-server /etc/d2r-server
install -d -m 750 -o d2r-server -g d2r-server /var/lib/d2r-server
if [[ ! -f /etc/d2r-server/server.env ]]; then
  install -m 640 -o root -g d2r-server "$source_dir/server.env" /etc/d2r-server/server.env
fi
# Each install gets a fresh directory; previous versions remain available for rollback.
target=$(mktemp -d "/opt/d2r-server/$version.XXXXXXXX")
chmod 755 "$target"
cp -a "$source_dir/." "$target/"
chmod -R a+rX "$target"
chmod 755 "$target/runtime/node"
if systemctl is-active --quiet d2r-server; then systemctl stop d2r-server; fi
ln -sfn "$target" /opt/d2r-server/current
install -m 644 "$source_dir/d2r-server.service" /etc/systemd/system/d2r-server.service
systemctl daemon-reload
systemctl enable --now d2r-server
sleep 2
systemctl is-active --quiet d2r-server || { journalctl -u d2r-server -n 40 --no-pager; exit 1; }
echo 'D2R server installed. Default address: http://SERVER-IP:5173'
echo 'Configuration: /etc/d2r-server/server.env; data: /var/lib/d2r-server'
