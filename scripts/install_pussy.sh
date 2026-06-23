#!/bin/sh
# Installation script for space-pussy.

binpaths="/usr/local/bin /usr/bin"
libpaths="/usr/lib /usr/local/lib"

# This variable contains a nonzero length string in case the script fails
# because of missing write permissions.
is_write_perm_missing=""

# Get the latest release from GitHub API
latest_release=$(curl -s https://api.github.com/repos/greatweb/space-pussy/releases/latest)
latest_tag=$(echo "$latest_release" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

# Download and install space-pussy from GitHub
PLATFORM=$(uname)
case "$PLATFORM" in
  "Darwin"|"Linux")
    wget https://github.com/greatweb/space-pussy/archive/refs/tags/$latest_tag.zip
    unzip $latest_tag.zip
    cd space-pussy-${latest_tag#v}
    make build
    for binpath in $binpaths; do
      if cp build/pussy "$binpath"; then
        echo "Moved pussy to $binpath"
        echo "Enjoy your space-pussy experience!"
        rm ~/$latest_tag.zip
        rm -rf ~/space-pussy-${latest_tag#v}
        pussy --help
        exit 0
      else
        if [ -d "$binpath" ] && [ ! -w "$binpath" ]; then
          is_write_perm_missing=1
          rm ~$latest_tag.zip
          rm -rf ~/space-pussy-${latest_tag#v}
        fi
      fi
    done
    ;;
esac

echo "We cannot install pussy in one of the directories $binpaths"

if [ -n "$is_write_perm_missing" ]; then
  echo "It seems that we do not have the necessary write permissions."
  echo "Perhaps try running this script as a privileged user:"
  echo "Or check that you are using the default library path."
  echo "    sudo $0"
  echo
fi

exit 1
