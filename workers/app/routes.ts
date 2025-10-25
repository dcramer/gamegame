import { type RouteConfig, index, route, prefix } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("games", "routes/games.tsx"),
  route("games/:gameId", "routes/games.$gameId.tsx"),
  route("login", "routes/login.tsx"),
  route("login/verify", "routes/login.verify.tsx"),

  // Admin routes (prefixed with /admin)
  ...prefix("admin", [
    index("routes/admin.tsx"),
    route("add-game", "routes/admin.add-game.tsx"),
    route("games/:gameId", "routes/admin.games.$gameId.tsx", [
      index("routes/admin.games.$gameId.details.tsx"),
      route("resources", "routes/admin.games.$gameId.resources-list.tsx"),
      route("attachments", "routes/admin.games.$gameId.attachments.tsx"),
    ]),
    route("games/:gameId/edit", "routes/admin.games.$gameId.edit.tsx"),
    route("games/:gameId/resources/:resourceId", "routes/admin.games.$gameId.resources.$resourceId.tsx", [
      index("routes/admin.games.$gameId.resources.$resourceId.details.tsx"),
      route("attachments", "routes/admin.games.$gameId.resources.$resourceId.attachments-list.tsx"),
    ]),
    route("games/:gameId/resources/:resourceId/attachments/:attachmentId", "routes/admin.games.$gameId.resources.$resourceId.attachments.$attachmentId.tsx"),
  ]),
] satisfies RouteConfig;
