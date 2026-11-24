# Extra root certificates for the container build

Empty in the repository on purpose. If your machine or network inspects TLS
traffic (a proxy that re-signs certificates), put that proxy's root CA here
as a `.crt` file before `docker compose up --build`: the container has its
own certificate store and does not see the host's. Certificates are ignored
by git, because each one is unique to a machine.
