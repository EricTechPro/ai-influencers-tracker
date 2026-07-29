# Mockup screenshots

Full-page renders of the files in `docs/mockups/`. Every PNG here is regenerable, so
the images are gitignored and this README is not.

```bash
python3 docs/mockups/serve.py &          # port 3013
docs/mockups/shoot.sh              # every mockup, or pass one name
docs/mockups/shoot.sh topics-recent
```

Naming is `<mockup-name>.png`, matching the HTML file it came from. Nothing else
writes here, and nothing reads from here: these are for looking at.
