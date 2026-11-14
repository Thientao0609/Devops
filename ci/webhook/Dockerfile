FROM python:3.12.12-slim-bookworm AS validation
COPY ci/webhook/relay.py /tmp/relay.py
RUN python -m py_compile /tmp/relay.py
FROM python:3.12.12-slim-bookworm
RUN groupadd -g 10001 clinic && useradd -u 10001 -g clinic -M clinic && mkdir /data && chown 10001:10001 /data
COPY --from=validation /tmp/relay.py /app/relay.py
ENV PYTHONUNBUFFERED=1
USER 10001:10001
EXPOSE 8085
HEALTHCHECK --interval=10s --timeout=3s --retries=10 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8085/health',timeout=2)"
CMD ["python", "/app/relay.py"]
