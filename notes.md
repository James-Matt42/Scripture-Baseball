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

## HTML

Interesting things I have learned about HTML

## React

Interesting things I have learned about React
