## Raycast 2FA

This repository aims to be a bridge between Google Authenticator export and the Raycast [Two-Factor Authentication Code Generator|https://www.raycast.com/cjdenio/two-factor-authentication-code-generator] extension.

### Step-by-step

- Click to export on the Google Authenticator app, which will generate multiple QR codes
- Screenshot all images and move to computer
- Place all images on the `input` folder
- Run `yarn && yarn start`
- The script will generate a file `output.data` with all TOTP urls
- Import it to Raycast extension

### How it works

- Each QR code when decoded contain a url like `otpauth-migration://offline?data=...` where data is a base64 encoded string
- Decoding the base64 data using protobuf, we can see each object of this shape `{secret:'ASDFHJKL',name:'email@example.com',issuer:'Provider',algorithm:'SHA1',digits:6}`
- From that object we can encode it back into a TOTP url like `otpauth://totp/Amazon:email%example.com?secret=ASDFGHJKL&issuer=Provider&algorithm=SHA1&digits=6`
- The script groups all urls into the file `output.data`
