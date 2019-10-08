def main(request, response):
    """
    Simple handler that returns an HTML response that passes when the required
    Client Hints are received as request headers.
    """
    # TODO(yoav): add more header values
    values = [ "Device-Memory", "DPR" ]

    result = "PASS"
    for value in values:
        should = request.GET[value.lower()]
        present = request.headers.get(value)
        if (should and not present) or (not should and present):
            result = "FAIL"

    response.headers.append("Access-Control-Allow-Origin", "*")
    body = "<script>window.parent.postMessage('" + result + "', '*');</script>"

    response.content = body
