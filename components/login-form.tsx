"use client";

import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/actions/auth";
import { Loader2 } from "lucide-react";
import { useState } from "react";

export default function LoginForm() {
  const [isLoading, setLoading] = useState(false);

  return (
    <div className="mx-auto grid max-w-[400px] gap-12">
      <div className="grid gap-2 text-center">
        <h1 className="text-3xl font-bold">Login</h1>
        <p className="text-balance text-muted-foreground">
          Enter your email below to continue.
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
        <p className="text-xs text-muted-foreground">
          We'll automatically create an account if you don't have one.
        </p>
      </form>
    </div>
  );
}
