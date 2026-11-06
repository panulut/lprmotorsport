#!/usr/bin/env bash
set -euo pipefail
build_only=false
case "${1:-}" in
 --build-only) build_only=true ;;
 '') ;;
 *) echo 'Usage: build-azure-test-image.sh [--build-only]' >&2; exit 2 ;;
esac
source_commit=7788a00a04dc3abd47918f27a93dd4d0a469b45c
task_root=$(git rev-parse --show-toplevel)
task_context=$(mktemp -d)
trap 'rm -rf "$task_context"' EXIT
wrapper_sha=$(sha256sum "$task_root/verification/azure-test-bootstrap.cjs" | cut -d' ' -f1)
task_image="ghcr.io/panulut/lprmotorsport/verification:capacity-test-${source_commit:0:7}-${wrapper_sha:0:12}"
if [[ -n "${GITHUB_RUN_ID:-}" ]]; then
 task_image="$task_image-$GITHUB_RUN_ID-${GITHUB_RUN_ATTEMPT:-1}"
fi
git -C "$task_root" archive "$source_commit" | tar -x -C "$task_context"
cp "$task_root/Dockerfile.azure-test" "$task_context/Dockerfile.azure-test"
cp "$task_root/verification/azure-test-bootstrap.cjs" "$task_context/verification/azure-test-bootstrap.cjs"
docker build --file "$task_context/Dockerfile.azure-test" --build-arg "LPR_RELEASE_COMMIT=$source_commit" --build-arg "LPR_TEST_WRAPPER_SHA=$wrapper_sha" --tag "$task_image" "$task_context"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
 printf 'image=%s\nsource_commit=%s\nwrapper_sha=%s\n' "$task_image" "$source_commit" "$wrapper_sha" >> "$GITHUB_OUTPUT"
fi
if "$build_only"; then
 printf 'Built test image: %s\n' "$task_image"
 exit 0
fi
docker push "$task_image"
docker inspect --format '{{index .RepoDigests 0}}' "$task_image"
