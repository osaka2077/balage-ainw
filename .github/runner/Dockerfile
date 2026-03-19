# GitHub Actions Self-Hosted Runner
# Pinned to Ubuntu 24.04 for reproducibility
FROM ubuntu:24.04

ARG RUNNER_VERSION=2.321.0
ARG RUNNER_ARCH=x64

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install base dependencies (mirrors what runs-on: ubuntu-latest provides)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    jq \
    sudo \
    unzip \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22 (matches engines requirement in package.json)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Non-root runner user
RUN useradd -m -s /bin/bash runner \
    && echo "runner ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/runner

WORKDIR /home/runner

# Download and extract GitHub Actions Runner
RUN curl -fsSL -o actions-runner.tar.gz \
    "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz" \
    && tar xzf actions-runner.tar.gz \
    && rm actions-runner.tar.gz \
    && ./bin/installdependencies.sh \
    && rm -rf /var/lib/apt/lists/*

# Startup script handles registration + run
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Runner runs as non-root
RUN chown -R runner:runner /home/runner
USER runner

ENTRYPOINT ["/entrypoint.sh"]
