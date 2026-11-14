// Email settings for "Forgot password" (sends the reset link to the account's email).
// Uses EmailJS (free plan = 200 emails/month, no server needed). Setup:
//  1. Sign up at https://www.emailjs.com  ->  Email Services -> Add service (Gmail) -> copy the Service ID.
//  2. Email Templates -> Create template. Set "To email" to  {{to_email}}  and use these variables in the body:
//       {{to_name}}  {{username}}  {{reset_link}}  {{expires_in}}
//     Copy the Template ID.
//  3. Account -> General -> copy your Public Key.
//  4. Paste the three values below, then upload/deploy again.
window.MYNELLE_EMAIL = {
  serviceId: "",
  templateId: "",
  publicKey: "",
};
