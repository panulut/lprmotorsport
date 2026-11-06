#!/usr/bin/env bash
set -euo pipefail
source_commit=e70218a6298aecaacd748c62a77f6e67bfcae731
task_root=$(git rev-parse --show-toplevel)
task_context=$(mktemp -d)
trap 'rm -rf "$task_context"' EXIT
wrapper_sha=$(sha256sum "$task_root/verification/azure-test-bootstrap.cjs" | cut -d' ' -f1)
task_image="ghcr.io/panulut/lprmotorsport/verification:capacity-test-${source_commit:0:7}-${wrapper_sha:0:12}"
git -C "$task_root" archive "$source_commit" | tar -x -C "$task_context"
cp "$task_root/Dockerfile.azure-test" "$task_context/Dockerfile.azure-test"
cp "$task_root/verification/azure-test-bootstrap.cjs" "$task_context/verification/azure-test-bootstrap.cjs"
docker build --file "$task_context/Dockerfile.azure-test" --build-arg "LPR_RELEASE_COMMIT=$source_commit" --build-arg "LPR_TEST_WRAPPER_SHA=$wrapper_sha" --tag "$task_image" "$task_context"
docker push "$task_image"
docker inspect --format '{{index .RepoDigests 0}}' "$task_image"
