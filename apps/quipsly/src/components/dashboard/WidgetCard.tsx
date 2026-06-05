import React from "react";

export function classNames(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

type WidgetCardProps = {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "dark" | "glass";
  noPadding?: boolean;
};

export const WidgetCard = React.memo(({ children, className, variant = "default", noPadding = false }: WidgetCardProps) => {
  const baseStyles = "rounded-3xl shadow-sm relative overflow-hidden flex flex-col h-full transition-shadow duration-300 hover:shadow-md";
  
  const variants = {
    default: "bg-white border border-[#e8dcc4]",
    dark: "bg-slate-900 border border-slate-800 text-slate-200 shadow-2xl",
    glass: "bg-white/80 backdrop-blur-xl border border-[#e8dcc4] shadow-xl"
  };

  return (
    <div className={classNames(baseStyles, variants[variant], !noPadding && "p-6 md:p-8", className)}>
      {children}
    </div>
  );
});
