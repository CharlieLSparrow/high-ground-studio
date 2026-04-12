import os
import re

def fix_prisma():
    path = 'prisma/schema.prisma'
    if not os.path.exists(path): return
    
    print("🛠️ Fixing Prisma Schema...")
    # Correcting the non-existent @ref and @enum attributes
    new_content = """generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

model User {
  id           String        @id @default(uuid())
  email        String        @unique
  name         String?
  image        String?
  created      DateTime      @default(now())
  updated      DateTime      @updatedAt
  appointments Appointment[]
}

model Appointment {
  id              String   @id @default(uuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  clientName      String
  appointmentDate DateTime
  status          String   @default("PENDING")
  googleEventId   String?  @unique

  @@index([userId])
}
"""
    with open(path, 'w') as f:
        f.write(new_content)
    print("✅ Prisma Schema Sanitized.")

def fix_episodes_page():
    path = 'apps/web/src/app/episodes/[[...slug]]/page.tsx'
    if not os.path.exists(path): 
        # Check if it's still in docs
        path = 'apps/web/src/app/docs/[[...slug]]/page.tsx'
        if not os.path.exists(path): return

    print(f"🛠️ Applying Double Cast surgery to {path}...")
    with open(path, 'r') as f:
        content = f.read()

    # 1. Apply the Double Cast fix
    content = content.replace(
        'as Record<string, unknown>', 
        'as unknown as Record<string, unknown>'
    )
    
    # 2. Sync internal docs -> episodes strings
    content = content.replace("'/docs/'", "'/episodes/'")
    content.replace('"/docs/"', '"/episodes/"')
    content.replace('startsWith("/docs/")', 'startsWith("/episodes/")')
    content.replace('replace(/^\\/docs\\//', 'replace(/^\\/episodes\\//')

    with open(path, 'w') as f:
        f.write(content)
    print("✅ Episode Page Surgery Complete.")

def main():
    print("🚀 ARCHITECT FIXER INITIALIZED\n" + "="*30)
    fix_prisma()
    fix_episodes_page()
    print("="*30 + "\n🎉 All core build-killers have been neutralized.")
    print("\n👉 FINAL STEPS:")
    print("1. Run: pnpm install")
    print("2. Run: npx prisma generate")
    print("3. Git add, commit, and push!")

if __name__ == "__main__":
    main()