# Backups

Local Brain includes automated database backups with optional encryption and cloud storage. Backups run on a cron schedule inside a dedicated container — no host-level cron or external tools needed.

## How It Works

The `db-backup` container runs a three-stage pipeline on every scheduled backup:

1. **Dump** — `pg_dump | gzip` creates a compressed SQL backup
2. **Encrypt** (optional) — GPG symmetric encryption with AES-256
3. **Upload** (optional) — rclone copies the file to any S3-compatible cloud storage

Local backups are stored in a Docker volume. Cloud backups are stored wherever you point rclone. Both have independent retention policies.

## Quick Start — Local Only

Works out of the box with no configuration. Add these to `.env` to customize:

```
BACKUP_CRON=0 3 * * *      # default: 3 AM daily
BACKUP_RETAIN_COUNT=7       # default: keep 7 local backups
```

Rebuild and restart:

```bash
docker compose up -d --build db-backup
```

That's it. Backups happen automatically. Check the logs:

```bash
docker compose logs db-backup --tail 20
```

## Adding Encryption

Generate a strong passphrase:

```bash
openssl rand -base64 32
```

Add to `.env`:

```
BACKUP_ENCRYPTION_KEY=your-generated-passphrase
```

**Store this passphrase somewhere safe outside this machine.** If you lose the encryption key, your cloud backups are unrecoverable. Write it down, put it in a password manager, or store it in a second location.

Encrypted backups end with `.sql.gz.gpg`. The unencrypted `.sql.gz` is deleted immediately after encryption.

## Adding Cloud Storage

Cloud backup requires two things: a storage bucket and rclone configuration via environment variables.

### Step 1: Create a Bucket

Pick a provider. All pricing is approximate as of 2026.

**Backblaze B2** — cheapest general-purpose storage
- 10 GB free, then $0.005/GB/month
- Free egress to Cloudflare (pairs well if you already use CF Tunnel)
- Create a bucket and an application key at [backblaze.com](https://www.backblaze.com/cloud-storage)

**Cloudflare R2** — no egress fees ever
- 10 GB free, then $0.015/GB/month
- Zero egress costs (great if you restore frequently or from multiple machines)
- Create a bucket and API token at [Cloudflare dashboard](https://dash.cloudflare.com) > R2

**AWS S3** — battle-tested, most tooling support
- No free tier for storage (5 GB free for 12 months on new accounts)
- $0.023/GB/month (standard), $0.004/GB/month (Glacier Instant Retrieval)
- Create a bucket and IAM user at [aws.amazon.com](https://aws.amazon.com)

**Any S3-compatible provider** — MinIO, Wasabi, DigitalOcean Spaces, Linode Object Storage, etc. If it speaks the S3 API, rclone can talk to it.

### Step 2: Configure Environment Variables

rclone reads its configuration from `RCLONE_CONFIG_REMOTE_*` environment variables. No config file needed.

**Backblaze B2:**

```
RCLONE_REMOTE=remote:your-bucket-name/local-brain
RCLONE_CONFIG_REMOTE_TYPE=s3
RCLONE_CONFIG_REMOTE_PROVIDER=Other
RCLONE_CONFIG_REMOTE_ACCESS_KEY_ID=your-b2-key-id
RCLONE_CONFIG_REMOTE_SECRET_ACCESS_KEY=your-b2-application-key
RCLONE_CONFIG_REMOTE_ENDPOINT=s3.us-west-004.backblazeb2.com
RCLONE_CONFIG_REMOTE_REGION=us-west-004
```

Replace `us-west-004` with your bucket's region. You can find this in the B2 dashboard under the bucket details.

**Cloudflare R2:**

```
RCLONE_REMOTE=remote:your-bucket-name/local-brain
RCLONE_CONFIG_REMOTE_TYPE=s3
RCLONE_CONFIG_REMOTE_PROVIDER=Cloudflare
RCLONE_CONFIG_REMOTE_ACCESS_KEY_ID=your-r2-access-key
RCLONE_CONFIG_REMOTE_SECRET_ACCESS_KEY=your-r2-secret-key
RCLONE_CONFIG_REMOTE_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
```

Your account ID is in the Cloudflare dashboard URL or the R2 overview page.

**AWS S3:**

```
RCLONE_REMOTE=remote:your-bucket-name/local-brain
RCLONE_CONFIG_REMOTE_TYPE=s3
RCLONE_CONFIG_REMOTE_PROVIDER=AWS
RCLONE_CONFIG_REMOTE_ACCESS_KEY_ID=your-aws-access-key
RCLONE_CONFIG_REMOTE_SECRET_ACCESS_KEY=your-aws-secret-key
RCLONE_CONFIG_REMOTE_REGION=us-east-1
```

Use an IAM user with a policy scoped to just the backup bucket. Don't use root credentials.

**SFTP (your own server):**

```
RCLONE_REMOTE=remote:/path/to/backups
RCLONE_CONFIG_REMOTE_TYPE=sftp
RCLONE_CONFIG_REMOTE_HOST=your-server.com
RCLONE_CONFIG_REMOTE_USER=backup
RCLONE_CONFIG_REMOTE_KEY_FILE=/path/to/key
```

For SFTP, you'll need to mount the SSH key into the container. Add to the `db-backup` service volumes:

```yaml
- ./backup-ssh-key:/root/.ssh/id_ed25519:ro
```

### Step 3: Set Cloud Retention

```
BACKUP_CLOUD_RETAIN_COUNT=30    # default: keep 30 cloud backups
```

Cloud retention is separate from local. A typical setup: keep 7 locally (one week of fast restores) and 30 in the cloud (one month of disaster recovery).

### Step 4: Rebuild

```bash
docker compose up -d --build db-backup
```

The container runs a backup immediately on startup, so you'll see the first cloud upload in the logs right away.

## Verifying Backups

### Check the logs

```bash
docker compose logs db-backup --tail 30
```

You should see lines like:

```
[date] Dump complete: localbrain_20260328_030000.sql.gz (42K)
[date] Encrypted: localbrain_20260328_030000.sql.gz.gpg
[date] Uploading to remote:my-bucket/local-brain/localbrain_20260328_030000.sql.gz.gpg...
[date] Upload complete.
[date] Local backups: 7/7
[date] Done.
```

### List local backups

```bash
docker compose exec db-backup ls -lh /backups/
```

### List cloud backups

```bash
docker compose exec db-backup rclone ls "$RCLONE_REMOTE"
```

### Test a restore (dry run)

Download a backup and verify it's a valid SQL dump without actually restoring:

```bash
docker compose exec db-backup sh -c \
  'gunzip -c /backups/localbrain_*.sql.gz | head -20'
```

For encrypted backups:

```bash
docker compose exec db-backup sh -c \
  'gpg --batch --decrypt --passphrase "$BACKUP_ENCRYPTION_KEY" \
  /backups/localbrain_*.sql.gz.gpg | gunzip | head -20'
```

## Restoring

### From a local backup

```bash
docker compose exec db-backup restore.sh localbrain_20260328_030000.sql.gz
```

### From an encrypted local backup

Make sure `BACKUP_ENCRYPTION_KEY` is set in `.env`, then:

```bash
docker compose exec db-backup restore.sh localbrain_20260328_030000.sql.gz.gpg
```

### From a cloud backup

If the file isn't in the local volume, the restore script downloads it from cloud storage automatically:

```bash
docker compose exec db-backup restore.sh localbrain_20260328_030000.sql.gz.gpg
```

### List available backups (local and cloud)

```bash
docker compose exec db-backup restore.sh
```

Running `restore.sh` with no arguments lists all available backups from both local and cloud storage.

### Full disaster recovery

If the machine is gone and you're starting from scratch:

1. Set up a new Local Brain instance (follow SETUP.md)
2. Configure the same `BACKUP_ENCRYPTION_KEY` and `RCLONE_REMOTE` in `.env`
3. Start the stack: `docker compose up -d`
4. List cloud backups: `docker compose exec db-backup restore.sh`
5. Restore the latest: `docker compose exec db-backup restore.sh <filename>`

Your thoughts, embeddings, metadata, users, and connections are all in the SQL dump. Nothing is lost except the MCP keys (which you should have stored separately anyway).

## Cron Schedule Examples

| Schedule | Cron Expression | Use Case |
|---|---|---|
| Daily at 3 AM | `0 3 * * *` | Default — good for most setups |
| Every 6 hours | `0 */6 * * *` | Active use, captures lots of thoughts |
| Twice daily | `0 3,15 * * *` | 3 AM and 3 PM |
| Weekly on Sunday | `0 3 * * 0` | Low volume, save cloud storage |
| Every 12 hours | `0 */12 * * *` | Balanced for moderate use |

## Cost Estimates

Local Brain databases are small. A typical personal brain with thousands of thoughts produces backups under 10 MB. Even at 50 MB per backup with daily cadence:

- **Backblaze B2**: 30 backups x 50 MB = 1.5 GB = **$0.0075/month** (effectively free)
- **Cloudflare R2**: same = **$0.0225/month**
- **AWS S3 Standard**: same = **$0.035/month**

The storage costs are negligible. Your thoughts are worth more than a few pennies a month.

## Security Notes

- **Encryption key management** is the critical piece. If you encrypt backups and lose the key, the backups are gone. Store the key in a password manager or print it out. Don't keep the only copy on the machine being backed up.
- **Cloud credentials** should be scoped. On B2, create an application key limited to a single bucket. On AWS, create an IAM user with a policy that only allows `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, and `s3:ListBucket` on the backup bucket. On R2, create an API token scoped to the bucket.
- **Backups contain everything** — thought content, metadata, embeddings, user info. If your thoughts are sensitive, always encrypt before uploading.
- **rclone environment variables** contain secrets. They're passed as Docker environment variables (not written to disk inside the container). Make sure your `.env` file has restricted permissions: `chmod 600 .env`.
