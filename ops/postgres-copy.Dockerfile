# syntax=docker/dockerfile:1

FROM postgres:17-bookworm

WORKDIR /ops

COPY ops/postgres-copy-entrypoint.sh /ops/postgres-copy-entrypoint.sh

RUN chmod +x /ops/postgres-copy-entrypoint.sh

ENTRYPOINT ["/ops/postgres-copy-entrypoint.sh"]
