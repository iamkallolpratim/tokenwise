def ask(q):
    attempts = 0
    while True:
        try:
            return client.messages.create(model=M, messages=[q])
        except RateLimitError:
            attempts += 1
            if attempts >= max_retries:
                raise
