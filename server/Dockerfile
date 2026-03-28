FROM denoland/deno:2.3.3

WORKDIR /app

# Copy dependency manifest and cache dependencies
COPY deno.json ./
RUN deno install

# Copy server source
COPY index.ts ./
COPY admin/ ./admin/
COPY scripts/ ./scripts/

# Run as non-root
USER deno

EXPOSE 8000

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write=/app/.env", "index.ts"]
