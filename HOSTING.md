# Hosting

GitHub Pages from `main` (root) of https://github.com/davidthurmond-gif/berwick-a-reserve-4 → https://davidthurmond-gif.github.io/berwick-a-reserve-4/

Publishing uses the fine-grained token saved in `.github-pat` in the "Saturday Comp - A Reserve 4" project folder on David's Mac (repo-scoped, Contents read/write). Never commit it. The weekly scheduled task clones the repo to a temp folder, runs `tools/trols_sync.py`, commits and pushes with that token.
