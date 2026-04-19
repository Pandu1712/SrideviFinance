import { useState } from "react";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const SetupSuperAdmin = () => {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  const handleSetup = async () => {
    setLoading(true);
    const email = "sridevigroups3333@gmail.com";
    const password = "Ashok@3333";

    try {
      let uid: string;

      try {
        // Try creating new account
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        uid = cred.user.uid;
      } catch (err: any) {
        if (err?.code === "auth/email-already-in-use") {
          // Account exists, sign in instead
          const cred = await signInWithEmailAndPassword(auth, email, password);
          uid = cred.user.uid;
        } else {
          throw err;
        }
      }

      // Check if Firestore doc exists, create if not
      const userRef = doc(db, "users", uid);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        await setDoc(userRef, {
          uid,
          email,
          name: "Super Admin",
          role: "super_admin",
        });
        toast.success("Super Admin Firestore document created!");
      } else {
        toast.success("Super Admin account is ready!");
      }

      setDone(true);
    } catch (err: any) {
      toast.error(err?.message || "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary p-4">
      <Card className="w-full max-w-md border-accent">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-primary">Super Admin Setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {done ? (
            <>
              <p className="text-foreground font-semibold">✅ Super Admin is ready!</p>
              <Button onClick={() => navigate("/login")} className="bg-accent text-accent-foreground">
                Go to Login
              </Button>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-sm">
                This will create/verify the Super Admin account with the provided credentials.
              </p>
              <Button onClick={handleSetup} disabled={loading} className="w-full bg-accent text-accent-foreground">
                {loading ? "Setting up..." : "Create Super Admin"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SetupSuperAdmin;
