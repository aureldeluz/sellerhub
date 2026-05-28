import { Link } from "react-router-dom";
import { Gamepad2 } from "lucide-react";

export default function ForgotPassword() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-md bg-[#FFC83D] flex items-center justify-center">
            <Gamepad2 className="w-5 h-5 text-black" />
          </div>
          <div className="font-display font-bold text-2xl tracking-tight">SellerHub</div>
        </div>
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-8 space-y-4 text-center">
          <h1 className="font-display text-2xl font-semibold">Reset password</h1>
          <p className="text-sm text-zinc-400" data-testid="contact-admin-msg">
            Silahkan kontak admin jika ingin reset password
          </p>
          <div className="pt-2">
            <Link to="/login" data-testid="back-to-login-link" className="text-sm text-[#FFC83D] hover:underline">
              Back to login page
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
