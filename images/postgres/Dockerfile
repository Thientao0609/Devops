FROM postgres:17.12-alpine3.24@sha256:34261f594522cf41dfcb76aefd42b9d201098b0e6b23c9c68733f169e4218b6f AS config
RUN printf '#!/bin/sh\nexec pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"\n' > /tmp/health.sh && chmod 0555 /tmp/health.sh && test -s /tmp/health.sh
FROM postgres:17.12-alpine3.24@sha256:34261f594522cf41dfcb76aefd42b9d201098b0e6b23c9c68733f169e4218b6f
COPY --from=config --chown=postgres:postgres /tmp/health.sh /opt/health.sh
USER postgres
HEALTHCHECK --interval=5s --timeout=3s --retries=20 CMD ["/opt/health.sh"]
