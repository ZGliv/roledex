const APPLE_TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/;
const BUNDLE_ID_PATTERN = /^[A-Za-z0-9]+(?:[.-][A-Za-z0-9-]+)+$/;

export type AppleAppSiteAssociation = {
  applinks: {
    apps: [];
    details: Array<{
      appID: string;
      components: Array<{
        "/": string;
        comment: string;
      }>;
    }>;
  };
};

export function buildAppleAppSiteAssociation(input: {
  bundleId: string | undefined;
  teamId: string | undefined;
}): AppleAppSiteAssociation | null {
  const teamId = input.teamId?.trim().toUpperCase();
  const bundleId = input.bundleId?.trim();
  if (
    !teamId ||
    !bundleId ||
    !APPLE_TEAM_ID_PATTERN.test(teamId) ||
    !BUNDLE_ID_PATTERN.test(bundleId)
  ) {
    return null;
  }

  return {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${teamId}.${bundleId}`,
          components: [
            {
              "/": "/jobs/*",
              comment: "Open a RoleDex job detail in the iPhone app.",
            },
            {
              "/": "/saved",
              comment: "Open the saved-jobs tab in the iPhone app.",
            },
            {
              "/": "/profile",
              comment: "Open the profile tab in the iPhone app.",
            },
          ],
        },
      ],
    },
  };
}
