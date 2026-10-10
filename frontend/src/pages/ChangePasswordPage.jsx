import ChangePasswordForm from '../features/auth/ChangePasswordForm.jsx';

// The form centres itself on the page, both when forced (first sign-in) and when opened from the menu.
export default function ChangePasswordPage({ forced }) {
  return <ChangePasswordForm forced={forced} />;
}
