#!/bin/sh

set -eu

REPO='mjswensen/web-agent'
BIN_NAME='web-agent'

detect_os() {
	case "$(uname -s)" in
		Linux) echo 'linux' ;;
		Darwin) echo 'darwin' ;;
		*)
			echo "Unsupported operating system: $(uname -s)" >&2
			exit 1
			;;
	esac
}

detect_arch() {
	case "$(uname -m)" in
		x86_64|amd64) echo 'x64' ;;
		aarch64|arm64) echo 'arm64' ;;
		*)
			echo "Unsupported architecture: $(uname -m)" >&2
			exit 1
			;;
	esac
}

resolve_tag() {
	if [ -n "${WEB_AGENT_TAG:-}" ]; then
		echo "$WEB_AGENT_TAG"
		return
	fi

	curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
		| sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' \
		| head -n 1
}

os="$(detect_os)"
arch="$(detect_arch)"
asset="${BIN_NAME}-${os}-${arch}"
install_dir="${WEB_AGENT_INSTALL_DIR:-/usr/local/bin}"

if [ ! -w "$install_dir" ]; then
	install_dir="${HOME}/.local/bin"
fi

mkdir -p "$install_dir"

tag="$(resolve_tag)"
if [ -z "$tag" ]; then
	echo 'Unable to resolve latest release tag.' >&2
	exit 1
fi

url="https://github.com/${REPO}/releases/download/${tag}/${asset}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT INT TERM

echo "Installing ${BIN_NAME} ${tag} for ${os}-${arch}..."
curl -fsSL "$url" -o "${tmp_dir}/${BIN_NAME}"
chmod +x "${tmp_dir}/${BIN_NAME}"
mv "${tmp_dir}/${BIN_NAME}" "${install_dir}/${BIN_NAME}"

echo "Installed ${BIN_NAME} to ${install_dir}/${BIN_NAME}"
echo 'Run `web-agent --help` to verify installation.'
