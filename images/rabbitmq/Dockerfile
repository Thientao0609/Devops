FROM rabbitmq:4.2.9-management AS config
COPY enabled_plugins /tmp/enabled_plugins
RUN test -s /tmp/enabled_plugins
FROM rabbitmq:4.2.9-management
COPY --from=config --chown=rabbitmq:rabbitmq /tmp/enabled_plugins /etc/rabbitmq/enabled_plugins
USER rabbitmq
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=10 CMD rabbitmq-diagnostics -q ping
