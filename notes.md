# CS 260 Notes

This file represents what I have learned about web programming.

- [My startup](https://startup.cs260.click)
- [My simon](https://simon.cs260.click)

## Helpful links

- [Course instruction](https://github.com/webprogramming260)
- [Canvas](https://byu.instructure.com)
- [MDN](https://developer.mozilla.org)

## AWS

### My public IP address:

54.147.217.235

### SSH into the machine:

ssh -i path/to/key/pair ubuntu@54.147.217.235

### Purchasing a domain name:

[Register a new domain](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/domain-register.html)

- Go to the `Route 53` service
- Click `Hosted zones`
- Click on your domain name
- Click on `Create record` twice
    - Both times put your public IP address into the `Value` box
    - Only the second time, in the `Record name` box, enter `*` so that any subdomain will match
    - Click `Create records`
    - This should create a new `A` type record

### Setting up HTTPS with Caddy:

[Let's Encrypt](https://letsencrypt.org/how-it-works/) is a non-profit that allows you to dynamically request and renew a certificate to use HTTPS

The following is the example provided by the course of how to set up a `Caddyfile` so that it automatically uses Let's Encrypt to establish a secure connection:

```
myfunkychickens.click {
   root * /usr/share/caddy
   file_server
   header Cache-Control no-store
   header -etag
   header -server
}


startup.myfunkychickens.click {
   reverse_proxy * localhost:4000
   header Cache-Control no-store
   header -server
   header -etag
   header Access-Control-Allow-Origin *
}

simon.myfunkychickens.click {
   reverse_proxy * localhost:3000
   header Cache-Control no-store
   header -server
   header -etag
   header Access-Control-Allow-Origin *
}
```

## HTML

Interesting things I have learned about HTML

## React

Interesting things I have learned about React
