// W3C's validation regex for <input type="email">. This is quite permissive, but doesn't allow unicode domain names
// (e.g. foo@mañana.com). To handle unicode domain names, the server-side code would have to be changed to automatically
// convert them to punycode when sending emails, as AWS SES doesn't support unicode domain names.

export default /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/
