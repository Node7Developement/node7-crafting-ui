# NODE7 Recipe Notes

`node7-crafting-ui` is a standalone NUI presentation resource.

Recommended placement:

```text
resources/[node7-ui]/node7-crafting-ui
```

Add to `server.cfg`:

```cfg
exec @node7-crafting-ui/permissions.cfg
ensure node7-crafting-ui
```

No SQL is required. No crafting recipes or gameplay logic are installed by this resource.

## v1.4.0 UI additions

The UI now supports active craft progress, richer queue states, max-craftable quantity, recipe availability filters, optional requirements display, and a loading state. These are presentation/API features only; gameplay crafting remains owned by the calling resource.
