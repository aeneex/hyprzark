# HyprZark — An Arch Linux Hyprland Rice

## Screenshots

![Screenshot 1](Screenshots/01.png)
![Screenshot 2](Screenshots/02.png)
![Screenshot 3](Screenshots/03.png)
![Screenshot 4](Screenshots/04.png)
![Screenshot 5](Screenshots/05.png)
![Screenshot 6](Screenshots/06.png)
![Screenshot 7](Screenshots/07.png)
![Screenshot 8](Screenshots/08.png)
![Screenshot 9](Screenshots/09.png)

## What is HyprZark?

HyprZark takes the minimalist spirit of the original Zark i3 rice and brings it to **Hyprland** — a dynamic tiling Wayland compositor known for its smooth animations and modern feature set. While Zark was clean and functional, HyprZark goes further: better visuals, richer configuration, more thoughtful defaults, and a setup that feels like a cohesive desktop environment rather than a patched-together window manager setup.

If you loved Zark, you'll feel right at home. If you're new — welcome to your new daily driver.

---

## Features

- **Window Manager**: Hyprland (Wayland)
- **Status Bar**: Waybar
- **Application Launcher**: Rofi
- **Terminal**: Kitty
- **Notifications**: SwayNC
- **Audio Visualizer**: Cava
- **Shell**: Zsh
- **File Manager**: Ranger
- **System Info**: Fastfetch
- **Screen Lock**: Hyprlock

---

## Installation

HyprZark is designed for a **fresh Arch Linux installation**.

### Prerequisites

- Fresh Arch Linux install
- Internet connection
- That's it — the script handles the rest

### Install

1. Clone the repository:
```bash
git clone https://github.com/aeneex/hyprzark.git
cd hyprzark
```

2. Make the install script executable and run it:
```bash
chmod +x install.sh
./install.sh
```

The script will automatically:
- Update your system (`pacman -Syyu`)
- Install `yay` if not already present
- Install all required packages with conflict resolution and verification
- Run `setup.sh` to deploy all configuration files and dotfiles

> You only need to run `install.sh` — it calls `setup.sh` automatically.

3. Reboot for everything to take effect.

### What the installer does differently

The install scripts are built to not silently fail. Specifically:

- Every package install is **verified** via `pacman -Qi` after the fact
- File conflicts are resolved automatically with `--overwrite`
- Package-level conflicts are resolved by removing the offending package before retrying
- Keyring and signature errors trigger an `archlinux-keyring` refresh and retry
- All output is written to a timestamped log file (`install-YYYYMMDD-HHMMSS.log`) next to the script
- Failed packages are collected and printed as a summary at the end instead of silently disappearing

---

## What Gets Installed

### Core Packages
| Package | Purpose |
|---------|---------|
| `hyprlock` | Screen locker |
| `waybar` | Status bar |
| `rofi` | Application launcher |
| `swaync` | Notification daemon |
| `btop` | System monitor |
| `cava` | Audio visualizer |
| `exa` | Modern `ls` replacement |
| `fastfetch` | System info display |
| `fzf` | Fuzzy finder |
| `neovim` | Text editor |
| `ranger` | Terminal file manager |
| `unzip`, `zip` | Archive utilities |
| `awww` | Wallpaper daemon |
| `ddcutil` | Monitor brightness control |
| `libnotify` | Notification library |
| `noto-fonts-cjk` | CJK font support |
| `pamixer` | PulseAudio CLI mixer |
| `playerctl` | Media player control |
| `wl-clipboard` | Wayland clipboard |
| `imagemagick` | Image processing |
| `mpv` | Media player |
| `nsxiv` | Image viewer |
| `pipewire` + plugins | Audio stack |
| `wireplumber` | PipeWire session manager |
| `rtkit` | Realtime scheduling |
| `xdg-desktop-portal` + backends | Portal support for Wayland |
| `libva-nvidia-driver` | NVIDIA VA-API (remove if no NVIDIA GPU) |

### Basic Packages
| Package | Purpose |
|---------|---------|
| `gnome-calculator` | Calculator |
| `gnome-calendar` | Calendar |
| `lxappearance` | GTK theme switcher |
| `nwg-look` | GTK settings for Wayland |
| `pavucontrol` | Audio control GUI |
| `pcmanfm` | GUI file manager |

### AUR Packages (via yay)
| Package | Purpose |
|---------|---------|
| `activate-linux` | "Activate Windows"-style watermark |
| `brave-bin` | Brave browser (remove if unused) |
| `kernel-modules-hook` | Rebuilds modules after kernel updates |
| `tty-clock` | Terminal clock |
| `waybar-module-pacman-updates-git` | Waybar update count module |

---

## Fonts

Custom fonts are installed to `/usr/share/fonts/`:

| Font | Usage |
|------|-------|
| **Caskaydia Cove Nerd Font** | Terminal & code |
| **Cousine Nerd Font** | UI elements |
| **Noto Color Emoji** | Emoji support |
| **SF UI Text** | General UI text |

---

## Configuration

All configs land in `~/.config/` after setup:

| Component | Path |
|-----------|------|
| Hyprland | `~/.config/hypr/` |
| Waybar | `~/.config/waybar/` |
| Kitty | `~/.config/kitty/` |
| Rofi | `~/.config/rofi/` |
| SwayNC | `~/.config/swaync/` |
| Cava | `~/.config/cava/` |
| Ranger | `~/.config/ranger/` |
| Fastfetch | `~/.config/fastfetch/` |
| Gowall | `~/.config/gowall/` |
| XDG Portal | `~/.config/xdg-desktop-portal/` |

Zsh configuration lives at `~/.zshrc`.
Wallpapers are copied to `~/Wallpapers/`.

---

## Post-Install (Recommended)

The repo doesn't ship with the GTK theme and icon pack used in the screenshots. You can grab them here:
- GTK Theme: [graphite-gtk-theme](https://github.com/vinceliuice/Graphite-gtk-theme)
- Icons: [tela-circle-icons](https://github.com/vinceliuice/Tela-circle-icon-theme)

---

## Notes

- Built on Wayland — no X11 required
- Smooth Hyprland animations out of the box
- Designed to feel like a complete desktop environment, not just a WM config
- All configs are clean, well-structured, and easy to modify
- Minimal bloat, maximum intentionality

---

## Credits

HyprZark — built with ☕, patience, and a lot of `hyprctl reload`

## License

Feel free to use, modify, and distribute as you wish.
