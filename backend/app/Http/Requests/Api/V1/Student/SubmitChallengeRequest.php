<?php

namespace App\Http\Requests\Api\V1\Student;

use Illuminate\Foundation\Http\FormRequest;

class SubmitChallengeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'challenge_id' => ['required', 'integer', 'exists:challenges,id'],
            'submission' => ['required', 'array'],
            'elapsed_seconds' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
