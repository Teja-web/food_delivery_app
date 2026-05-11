# Custom PostgreSQL with pgvector, pgmq, and pg_cron
FROM pgvector/pgvector:pg16

# Install dependencies for building PGMQ and pg_cron
RUN apt-get update && apt-get install -y \
    build-essential \
    postgresql-server-dev-16 \
    git \
    make \
    && rm -rf /var/lib/apt/lists/*

# Clone and install PGMQ (latest version for create_if_not_exists support)
RUN cd /tmp && \
    git clone --branch v1.8.1 https://github.com/tembo-io/pgmq.git && \
    cd pgmq/pgmq-extension && \
    make && \
    make install && \
    cd / && \
    rm -rf /tmp/pgmq

# Clone and install pg_cron
RUN cd /tmp && \
    git clone --branch v1.6.5 https://github.com/citusdata/pg_cron.git && \
    cd pg_cron && \
    make && \
    make install && \
    cd / && \
    rm -rf /tmp/pg_cron

# Clean up build dependencies
RUN apt-get purge -y git && apt-get autoremove -y

EXPOSE 5432

# pg_cron requires shared_preload_libraries
CMD ["postgres", "-c", "shared_preload_libraries=pg_cron", "-c", "cron.database_name=postgres"]
