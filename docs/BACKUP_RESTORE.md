# SmartPYQ Backup & Restore Guide

## Backup Strategy

### Database Backup

#### PostgreSQL (Production)

```bash
# Full backup
pg_dump -h localhost -U smartpyq smartpyq > backup_$(date +%Y%m%d_%H%M%S).sql

# Compressed backup
pg_dump -h localhost -U smartpyq smartpyq | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Restore from backup
psql -h localhost -U smartpyq smartpyq < backup_20240101_120000.sql
```

#### Automated Backup Script

```bash
#!/bin/bash
BACKUP_DIR="/backups/smartpyq"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Create backup
pg_dump -h localhost -U smartpyq smartpyq | gzip > "$BACKUP_DIR/smartpyq_$DATE.sql.gz"

# Remove old backups
find $BACKUP_DIR -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
```

### File Storage Backup

#### Supabase Storage

Supabase automatically handles storage redundancy. For additional safety:

1. Enable point-in-time recovery in Supabase dashboard
2. Periodically export critical files

#### Local Storage

```bash
# Backup uploaded files
tar -czf uploads_$(date +%Y%m%d).tar.gz ./uploads/

# Restore
tar -xzf uploads_20240101.tar.gz
```

### Configuration Backup

```bash
# Backup environment configuration (without secrets)
cp .env.example .env.backup.$(date +%Y%m%d)
```

## Restore Procedure

### Full Restore

1. **Stop the application**
   ```bash
   # Stop the uvicorn process / pause deploys on your host
   ```

2. **Restore database**
   ```bash
   psql -h localhost -U smartpyq smartpyq < backup.sql
   ```

3. **Restore files**
   ```bash
   tar -xzf uploads_backup.tar.gz
   ```

4. **Start the application**
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

5. **Verify**
   ```bash
   curl http://localhost:8000/health
   curl http://localhost:8000/ready
   ```

### Point-in-Time Recovery (PostgreSQL)

If using Supabase or a managed PostgreSQL:

1. Access the database dashboard
2. Select the restore point
3. Follow provider-specific restoration steps

## Recovery Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| RPO (Recovery Point Objective) | 24 hours | Daily backups |
| RTO (Recovery Time Objective) | 1 hour | Full restore time |

## Backup Schedule

| Component | Frequency | Retention |
|-----------|-----------|-----------|
| Database | Daily | 30 days |
| Files | Weekly | 90 days |
| Config | On change | Forever |

## Monitoring Backups

```bash
# Check backup age
ls -la /backups/smartpyq/*.sql.gz | tail -5

# Verify backup integrity
gunzip -t backup_20240101_120000.sql.gz
```

## Disaster Recovery

### Scenario: Complete Data Loss

1. Provision new database
2. Restore from latest backup
3. Update DNS/redirects
4. Verify application health
5. Communicate with users

### Scenario: Corrupted Data

1. Stop application immediately
2. Identify corruption scope
3. Restore to last known good state
4. Investigate root cause
5. Implement preventive measures

## Security Considerations

- Encrypt backups at rest
- Store backups in separate location
- Restrict backup access to authorized personnel
- Test restore procedure regularly
- Document any manual interventions
