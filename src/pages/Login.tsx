import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { IndianRupee, Shield, Mail, Lock, CheckCircle2, ArrowRight, UserCog, Smartphone, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";
import { logActivity } from "@/lib/audit";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, resetPassword, userData, user } = useAuth();
  const navigate = useNavigate();

  // Redirect once identity is cloud-synced
  useEffect(() => {
    if (user && userData) {
      logActivity(
        userData.uid,
        userData.name,
        userData.role,
        "LOGIN",
        `Personnel successfully authenticated and started a new session`
      );
      navigate("/dashboard");
    }
  }, [user, userData, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter credentials");
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      localStorage.removeItem("lineSelectedOnce");
      toast.success("Security Clearance Granted...");
      // Stay on loading state until AuthContext redirects via ProtectedRoute
      // or we can explicitly wait for synchronization here if desired.
    } catch (err: any) {
      toast.error(err?.message || "Invalid credentials");
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error("Enter your email address first");
      return;
    }
    try {
      await resetPassword(email);
      toast.success("Security reset link sent to your email");
    } catch (err: any) {
      toast.error(err?.message || "Failed to initiate recovery");
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020617]">
      {/* Decorative background gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[5%] -left-[5%] w-[30%] h-[30%] bg-accent/15 rounded-full blur-[100px]" />
        <div className="absolute bottom-[10%] right-[5%] w-[25%] h-[25%] bg-primary/20 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="z-10 w-full max-w-[440px] px-6"
      >
        <Card className="bg-[#0f172a]/80 backdrop-blur-xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] p-1">
          <CardHeader className="text-center space-y-5 pt-10 pb-6">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-accent-gradient shadow-[0_10px_30px_rgba(212,175,55,0.2)] border border-white/10"
            >
              <IndianRupee className="h-10 w-10 text-white" />
            </motion.div>
            
            <div className="space-y-1">
              <CardTitle className="text-3xl font-black text-white tracking-tighter uppercase italic">
                Sridevi <span className="text-accent not-italic">Finance</span>
              </CardTitle>
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em]">
                Enterprise Wealth Hub
              </p>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pb-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <motion.div 
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="space-y-2"
              >
                <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                   Personnel Email / ID
                </Label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-3.5 h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter Official Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 pl-10 bg-slate-900/50 border-white/5 text-white placeholder:text-slate-700 focus:ring-accent focus:border-accent/50 transition-all font-medium"
                  />
                </div>
              </motion.div>

              <motion.div 
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between ml-1">
                  <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Access Key
                  </Label>
                  <button 
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[10px] font-black text-accent hover:text-white uppercase tracking-widest transition-colors"
                  >
                    Recover?
                  </button>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-3 top-3.5 h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 pl-10 pr-10 bg-slate-900/50 border-white/5 text-white placeholder:text-slate-700 focus:ring-accent focus:border-accent/50 transition-all font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3.5 text-slate-500 hover:text-accent transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </motion.div>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="pt-2"
              >
                <Button 
                  type="submit" 
                  className="group w-full h-12 bg-accent text-accent-foreground font-bold text-lg hover:bg-accent/90 shadow-[0_0_20px_rgba(212,175,55,0.3)] transition-all active-scale" 
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                       Authenticating...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Shield className="h-5 w-5" />
                      Secure Login
                      <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                    </span>
                  )}
                </Button>
              </motion.div>
            </form>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/5"></span>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-[0.2em] text-slate-600">
                <span className="bg-[#1e293b] px-4">Trusted Infrastructure</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 text-slate-500">
              <div className="flex items-center gap-1.5 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all cursor-default">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="text-[10px] font-bold">SSA-E 16 Cert</span>
              </div>
              <div className="flex items-center gap-1.5 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all cursor-default">
                <Lock className="h-3.5 w-3.5" />
                <span className="text-[10px] font-bold">256-bit AES</span>
              </div>
            </div>

          </CardContent>
        </Card>
        
        <p className="mt-8 text-center text-slate-500 text-xs">
          Built for Scale. Secured by <span className="text-slate-400 font-bold">Sridevi Enterprise Systems</span>
        </p>
      </motion.div>
    </div>
  );
};

export default Login;
