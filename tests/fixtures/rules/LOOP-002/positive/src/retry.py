def ask(q):
    while True:
        try:
            return client.messages.create(model=M, messages=[q])
        except Exception:
            pass
