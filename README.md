# clipstack

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ yarn
```

### Development

```bash
$ yarn dev
```

### Build

```bash
# For windows
$ yarn build:win

# For macOS
$ yarn build:mac

# For Linux
$ yarn build:linux
```

# electron-clipstack

# electron-clipstack

# Sau khi bạn thay build/icon.png bằng file 1024×1024

mkdir -p /tmp/icon.iconset
sips -z 16 16 build/icon.png --out /tmp/icon.iconset/icon_16x16.png
sips -z 32 32 build/icon.png --out /tmp/icon.iconset/icon_16x16@2x.png
sips -z 32 32 build/icon.png --out /tmp/icon.iconset/icon_32x32.png
sips -z 64 64 build/icon.png --out /tmp/icon.iconset/icon_32x32@2x.png
sips -z 128 128 build/icon.png --out /tmp/icon.iconset/icon_128x128.png
sips -z 256 256 build/icon.png --out /tmp/icon.iconset/icon_128x128@2x.png
sips -z 256 256 build/icon.png --out /tmp/icon.iconset/icon_256x256.png
sips -z 512 512 build/icon.png --out /tmp/icon.iconset/icon_256x256@2x.png
sips -z 512 512 build/icon.png --out /tmp/icon.iconset/icon_512x512.png
cp build/icon.png /tmp/icon.iconset/icon_512x512@2x.png
iconutil -c icns /tmp/icon.iconset -o build/icon.icns
rm -rf /tmp/icon.iconset
