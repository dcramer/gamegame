"use client";

import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/actions/auth";
import { Loader2 } from "lucide-react";
import { useState } from "react";

export default function SignIn() {
  const [isLoading, setLoading] = useState(false);

  return (
    <div className="w-full lg:grid lg:min-h-[600px] xl:min-h-[800px]">
      <div className="flex items-center justify-center py-6 lg:py-12">
        <div className="mx-auto grid w-[350px] gap-6">
          <div className="grid gap-2 text-center">
            <h1 className="text-3xl font-bold">Login</h1>
            <p className="text-balance text-muted-foreground">
              Enter your email below to login. We'll automatically create an
              account if you don't have one.
            </p>
          </div>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setLoading(true);
              const formData = new FormData(event.currentTarget);
              await login(formData);
              setLoading(false);
            }}
            className="grid gap-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                name="email"
                placeholder="me@example.com"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              Login
              {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
