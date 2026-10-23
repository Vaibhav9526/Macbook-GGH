FROM coturn/coturn:4.17.2-r0
COPY remote/coturn/turnserver.conf /etc/coturn/jargon.conf
COPY remote/coturn/entrypoint.sh /usr/local/bin/jargon-coturn
ENTRYPOINT ["/usr/local/bin/jargon-coturn"]
