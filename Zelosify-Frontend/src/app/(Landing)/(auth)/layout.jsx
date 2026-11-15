"use client";
import { motion } from "framer-motion";
import { memo } from "react";
import { usePathname } from "next/navigation";

const AuthLayout = memo(({ children }) => {
  // The sign-up form has two columns, so it gets a wider card than sign-in.
  const wide = usePathname()?.startsWith("/register");
  return (
  <div className="min-h-screen bg-white dark:bg-gray-900 transition-colors duration-200">
    <div className="container mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-screen">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={`w-full ${wide ? "max-w-2xl" : "max-w-md"}`}
      >
        {children}
      </motion.div>
    </div>
  </div>
  );
});

export default AuthLayout;
