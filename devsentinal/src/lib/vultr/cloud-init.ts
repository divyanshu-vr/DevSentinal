// ============================================================
// Cloud-init YAML generator for Vultr golden image setup
// ============================================================

/**
 * Generate cloud-config YAML for bootstrapping a fresh Ubuntu instance.
 * Used only for initial golden image creation (not for snapshot-based instances).
 */
export function generateCloudInit(): string {
  return `#cloud-config

package_update: true

packages:
  - git
  - curl
  - wget
  - unzip
  - build-essential
  - python3
  - python3-pip
  - python3-venv

runcmd:
  # Install Node.js 20 LTS
  - curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  - apt-get install -y nodejs

  # Install global npm packages
  - npm install -g pnpm yarn madge sonarqube-scanner eslint

  # Install Python tools
  - pip3 install graph-sitter semgrep ruff

  # Install Go
  - snap install go --classic

  # Create sandbox workspace directory
  - mkdir -p /home/user/repo
  - chmod 777 /home/user/repo

  # Signal boot completion
  - touch /var/lib/cloud/instance/devsentinel-ready
`;
}

/**
 * Base64-encode a cloud-init YAML string for the Vultr API.
 */
export function encodeCloudInit(yaml: string): string {
  return Buffer.from(yaml).toString('base64');
}

/**
 * Shell script for manually setting up a golden image.
 * Run this via SSH on a fresh Ubuntu 22.04 instance, then snapshot it.
 */
export const GOLDEN_IMAGE_SETUP_SCRIPT = `#!/bin/bash
set -euo pipefail

echo "=== DevSentinel Golden Image Setup ==="

# System updates
apt-get update && apt-get upgrade -y

# Essential tools
apt-get install -y git curl wget unzip build-essential software-properties-common

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
echo "Node.js version: $(node -v)"

# Global npm packages
npm install -g pnpm yarn madge sonarqube-scanner eslint
echo "pnpm version: $(pnpm -v)"

# Python 3 + pip
apt-get install -y python3 python3-pip python3-venv
echo "Python version: $(python3 --version)"

# Python tools
pip3 install graph-sitter semgrep ruff
echo "Semgrep version: $(semgrep --version)"

# Go
snap install go --classic
echo "Go version: $(go version)"

# Create workspace
mkdir -p /home/user/repo
chmod 777 /home/user/repo

echo "=== Golden image setup complete ==="
echo "Next steps:"
echo "  1. Create a snapshot of this instance via Vultr API or dashboard"
echo "  2. Save the snapshot ID as VULTR_SNAPSHOT_ID in your .env"
echo "  3. Destroy this instance"
`;
