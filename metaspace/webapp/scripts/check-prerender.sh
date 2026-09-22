#!/usr/bin/env bash
# Post-deploy check: does the deployed site serve real HTML to a client that
# never runs JavaScript?
#
#   ./scripts/check-prerender.sh https://metaspace2020.org
#   ./scripts/check-prerender.sh https://staging.metaspace2020.org
#
# A staging host is recognised automatically (or force it with --staging), and
# the indexability checks invert: staging must be noindex. Canonical URLs are
# expected to point at production from every host - that is what a canonical is
# for - so those checks do not change.
#
# Everything here uses plain curl, exactly like a crawler or a link unfurler.
# Nothing is checked in a browser, on purpose - a passing browser proves
# nothing about what a crawler receives.

set -uo pipefail

BASE="${1:-https://metaspace2020.org}"
BASE="${BASE%/}"
# Canonical URLs always point at production, even when testing staging. This
# mirrors PRODUCTION_ORIGIN in src/lib/useSeo.ts.
CANONICAL_ORIGIN="https://metaspace2020.org"

# Whether this deployment is supposed to be indexed. Kept in step with
# `disabledDomains` in src/lib/useSeo.ts.
STAGING=0
case "${2:-}${BASE}" in
  *--staging* | *staging.metaspace2020.* ) STAGING=1 ;;
esac
if [ "$STAGING" = 1 ]; then
  EXPECT_ROBOTS='noindex, nofollow'
  ROBOTS_LABEL='is noindex (staging)'
else
  EXPECT_ROBOTS='index, follow'
  ROBOTS_LABEL='is indexable'
fi

pass=0
fail=0

get() { curl -sS --max-time 30 "$1"; }
status() { curl -sS --max-time 30 -o /dev/null -w '%{http_code}' "$1"; }

check() { # check <description> <condition-result:0|1>
  if [ "$2" -eq 0 ]; then
    printf '  \033[32mPASS\033[0m  %s\n' "$1"
    pass=$((pass + 1))
  else
    printf '  \033[31mFAIL\033[0m  %s\n' "$1"
    fail=$((fail + 1))
  fi
}

# Text a crawler would extract: strip scripts, then tags.
text_of() {
  perl -0777 -pe 's{<script.*?</script>}{}gsi; s{<style.*?</style>}{}gsi; s{<[^>]+>}{ }g; s{\s+}{ }g'
}

echo
echo "Checking $BASE"
[ "$STAGING" = 1 ] && echo "(staging: expecting noindex, canonicals still pointing at $CANONICAL_ORIGIN)"
echo

# --- home ------------------------------------------------------------------
echo "/ (home)"
home=$(get "$BASE/")
check "returns 200" "$([ "$(status "$BASE/")" = 200 ] && echo 0 || echo 1)"
check "has real body text (>1500 chars)" \
  "$([ "$(printf '%s' "$home" | text_of | wc -c)" -gt 1500 ] && echo 0 || echo 1)"
check "$ROBOTS_LABEL" "$(grep -qiF "name=\"robots\" content=\"$EXPECT_ROBOTS\"" <<<"$home" && echo 0 || echo 1)"
check "canonical is $CANONICAL_ORIGIN/" \
  "$(grep -qF "rel=\"canonical\" href=\"$CANONICAL_ORIGIN/\"" <<<"$home" && echo 0 || echo 1)"
check "has og:title and og:description" \
  "$(grep -q 'og:title' <<<"$home" && grep -q 'og:description' <<<"$home" && echo 0 || echo 1)"
check "has Organization JSON-LD" \
  "$(grep -q '"@type":"Organization"' <<<"$home" && echo 0 || echo 1)"

# --- pro -------------------------------------------------------------------
echo
echo "/pro"
pro=$(get "$BASE/pro")
check "returns 200" "$([ "$(status "$BASE/pro")" = 200 ] && echo 0 || echo 1)"
check "serves the Pro page, not the home fallback" \
  "$(grep -q 'Turning peaks into insights' <<<"$pro" && echo 0 || echo 1)"
check "has its own title" "$(grep -qi '<title>METASPACE Pro' <<<"$pro" && echo 0 || echo 1)"
check "canonical is $CANONICAL_ORIGIN/pro" \
  "$(grep -qF "rel=\"canonical\" href=\"$CANONICAL_ORIGIN/pro\"" <<<"$pro" && echo 0 || echo 1)"
check "has FAQPage JSON-LD" "$(grep -q '"@type":"FAQPage"' <<<"$pro" && echo 0 || echo 1)"
check "has real body text (>4000 chars)" \
  "$([ "$(printf '%s' "$pro" | text_of | wc -c)" -gt 4000 ] && echo 0 || echo 1)"

# --- the noindex shell -----------------------------------------------------
echo
echo "/datasets/does-not-exist (unprerendered route -> _shell.html)"
shell=$(get "$BASE/datasets/does-not-exist")
check "returns 200 so the SPA can take over" \
  "$([ "$(status "$BASE/datasets/does-not-exist")" = 200 ] && echo 0 || echo 1)"
check "is noindex" "$(grep -qi 'name="robots" content="noindex, nofollow"' <<<"$shell" && echo 0 || echo 1)"
# The shell carries the generic description in its meta, so look for the
# prerendered body wrapper instead of a phrase that also appears in <head>.
check "does NOT serve a prerendered page body (would be duplicate content)" \
  "$(grep -q 'id="prerendered-content"' <<<"$shell" && echo 1 || echo 0)"
check "claims no canonical" "$(grep -q 'rel="canonical"' <<<"$shell" && echo 1 || echo 0)"

# --- the other prerendered routes ------------------------------------------
echo
echo "other public routes"
for path in /annotations /datasets /projects /groups /publications /detectability /faq /contact /about; do
  body=$(get "$BASE$path")
  ok=0
  grep -qiF "name=\"robots\" content=\"$EXPECT_ROBOTS\"" <<<"$body" || ok=1
  grep -q 'rel="canonical"' <<<"$body" || ok=1
  check "$path $ROBOTS_LABEL, with a canonical" "$ok"
done

# --- assets referenced by the prerendered HTML -----------------------------
echo
echo "assets referenced by the prerendered pages"
missing=0
for page in "$home" "$pro"; do
  while read -r asset; do
    [ -z "$asset" ] && continue
    [ "$(status "$BASE$asset")" = 200 ] || { echo "      missing: $asset"; missing=1; }
  done < <(grep -o '/assets/[A-Za-z0-9_.-]*' <<<"$page" | sort -u)
done
check "every /assets/... URL resolves" "$missing"

# --- sitemap, robots, docs -------------------------------------------------
echo
echo "sitemap / robots / docs"
sitemap=$(get "$BASE/sitemap.xml")
check "sitemap.xml returns 200" "$([ "$(status "$BASE/sitemap.xml")" = 200 ] && echo 0 || echo 1)"
check "sitemap lists /pro" "$(grep -q "$CANONICAL_ORIGIN/pro<" <<<"$sitemap" && echo 0 || echo 1)"
check "sitemap lists the home page exactly once" \
  "$([ "$(grep -c "<loc>$CANONICAL_ORIGIN/</loc>" <<<"$sitemap")" = 1 ] && echo 0 || echo 1)"
check "sitemap does NOT list the noindex shell" \
  "$(grep -q '_shell' <<<"$sitemap" && echo 1 || echo 0)"
check "sitemap does NOT list /about (canonicalised to /)" \
  "$(grep -q "$CANONICAL_ORIGIN/about<" <<<"$sitemap" && echo 1 || echo 0)"
check "robots.txt returns 200" "$([ "$(status "$BASE/robots.txt")" = 200 ] && echo 0 || echo 1)"
check "docs site still serves HTML" "$([ "$(status "$BASE/docs/")" = 200 ] && echo 0 || echo 1)"
check "a missing file still 404s" \
  "$([ "$(status "$BASE/definitely-not-here.js")" = 404 ] && echo 0 || echo 1)"

echo
echo "  $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
