# Transactional sender DNS record

Observed in the signed-in Resend domain setup on 27 September 2026. Sender domain: `bookings.tachyharmonic.ai`; region: Ireland (`eu-west-1`). Jonny explicitly approved these sender settings. All three records below were added at Porkbun with TTL 600 and read back; Resend subsequently reported the domain verified. Sending is enabled; receiving is disabled. TLS was set to Enforced. A sending-only API key restricted to this domain was saved privately outside Git.

The three added records, with names relative to `tachyharmonic.ai`:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| TXT | `resend._domainkey.bookings` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC+TGrliwxLNTQ5QQnQxObdqoDHdCfzQp1WZbjBuW547hpsYMpQtg49UN94rRYzN3ZMycghgPgGYJw4GuVOMMpVMgyNCk8ztPe1M/RIpRZIIVQUhbkr3WV6JXhNUCVx6nkI4v3qvju+7JTiCQaPpqkvNLrrKDPIPMGW1ntCUb2BpQIDAQAB` | Auto/default |
| CNAME | `rsend.bookings` | `rsend-euw1.forge.rmta.net` | Auto/default |
| CNAME | `send.bookings` | `send.forge.rmta.net` | Auto/default |

These authorize the Resend sending subdomain and return path. They do not replace the root MX/SPF, existing Porkbun DKIM/DMARC, website A records or `www` CNAME. Check that each exact new host is absent before adding; stop on an existing conflicting value. The DKIM value is a public verification key, not a secret.

The original ten DNS records remained intact; the final DNS table contained thirteen. Delivery and sender-alignment evidence are recorded separately from DNS verification. Private management links must not pass through click tracking. No tracking domain was created. The human mailbox configuration was preserved.
