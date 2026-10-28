# Hosting

GitHub Pages from `main` (root) of https://github.com/Berwick-Tennis/berwick-tennis.github.io → https://berwick-tennis.github.io/

Publishing uses the fine-grained token saved in `.github-pat` in the "Saturday Comp - A Reserve 4" project folder on David's Mac (repo-scoped, Contents read/write). Never commit it. The weekly scheduled task clones the repo to a temp folder, runs `tools/trols_sync.py`, commits and pushes with that token.

The site moved here on 28 Oct 2026 from davidthurmond-gif/berwick-a-reserve-4 (that old address forwards here if the forwarding repo exists).
