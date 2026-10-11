#!/bin/sh
# Rebuilds docs/sql/accounting-hardening-apply.sql from the header, the verbatim hardening body and the footer.
cd "$(dirname "$0")/../docs/sql" || exit 1
cat accounting-hardening-apply.header.sql accounting-hardening.sql accounting-hardening-apply.footer.sql > accounting-hardening-apply.sql
