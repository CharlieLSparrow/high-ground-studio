function ownsEmail(user, email) {
  return Boolean(
    user &&
      (user.primaryEmail === email ||
        user.aliases.some((alias) => alias.email === email)),
  );
}

export function evaluateUserEmailSeparation({
  input,
  users,
  retainedFirebase,
  separateFirebase,
  retainedLedgerOwnerUserId,
  separateLedgerOwnerUserId,
}) {
  const retainedUser = users.find((user) => ownsEmail(user, input.retainedEmail));
  const separateUser = users.find((user) => ownsEmail(user, input.separateEmail));
  const sameCanonicalUser = Boolean(
    retainedUser && separateUser && retainedUser.id === separateUser.id,
  );
  const separateIsAlias = Boolean(
    retainedUser?.aliases.some((alias) => alias.email === input.separateEmail),
  );
  const directSeparatePrimaryExists = users.some(
    (user) => user.primaryEmail === input.separateEmail,
  );
  const retainedSubjectOwned = Boolean(
    retainedUser &&
      (retainedUser.firebaseUid === retainedFirebase.uid ||
        retainedLedgerOwnerUserId === retainedUser.id),
  );
  const separateSubjectOwned = Boolean(
    separateUser &&
      (separateUser.firebaseUid === separateFirebase.uid ||
        separateLedgerOwnerUserId === separateUser.id),
  );
  const alreadySeparated = Boolean(
    retainedUser &&
      separateUser &&
      retainedUser.id !== separateUser.id &&
      retainedUser.primaryEmail === input.retainedEmail &&
      separateUser.primaryEmail === input.separateEmail &&
      retainedUser.isActive &&
      separateUser.isActive &&
      retainedUser.emailVerified &&
      separateUser.emailVerified &&
      retainedFirebase.uid !== separateFirebase.uid &&
      retainedFirebase.emailVerified &&
      !retainedFirebase.disabled &&
      separateFirebase.emailVerified &&
      !separateFirebase.disabled &&
      retainedSubjectOwned &&
      separateSubjectOwned &&
      !retainedUser.aliases.some(
        (alias) => alias.email === input.separateEmail,
      ) &&
      !separateUser.aliases.some(
        (alias) => alias.email === input.retainedEmail,
      ),
  );
  const canSeparate = Boolean(
    retainedUser &&
      sameCanonicalUser &&
      separateIsAlias &&
      !directSeparatePrimaryExists &&
      retainedFirebase.uid !== separateFirebase.uid &&
      separateLedgerOwnerUserId === retainedUser.id &&
      separateFirebase.emailVerified &&
      !separateFirebase.disabled,
  );

  return {
    retainedUser,
    separateUser,
    sameCanonicalUser,
    separateIsAlias,
    directSeparatePrimaryExists,
    retainedSubjectOwned,
    separateSubjectOwned,
    alreadySeparated,
    canSeparate,
    ok: canSeparate || alreadySeparated,
  };
}
