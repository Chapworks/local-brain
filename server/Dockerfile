FROM denoland/deno:2.3.3

WORKDIR /app

# Copy dependency manifest and cache dependencies
COPY server/deno.json ./
RUN deno install

# Copy server source
COPY server/index.ts ./
COPY server/digest.ts ./
COPY server/import-parsers.ts ./
COPY server/usage.ts ./
COPY server/user-scope.ts ./
COPY server/notifications.ts ./
COPY server/admin/ ./admin/
COPY server/scripts/ ./scripts/

# Copy version and migrations
COPY VERSION ./
COPY migrations/ /app/migrations/

# Ensure deno user can write to cache and lockfile (bcrypt worker needs it)
RUN chown -R deno:deno /deno-dir /app

# Run as non-root
USER deno

EXPOSE 8000

CMD ["deno", "run", "--unstable-cron", "--allow-net", "--allow-env", "--allow-read", "--allow-write=/app/.env", "index.ts"]
