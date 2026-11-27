<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class RenameGroupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('group_name') && is_string($this->input('group_name'))) {
            $cleaned = (string) preg_replace('/\s+/', ' ', trim($this->input('group_name')));
            $this->merge(['group_name' => $cleaned]);
        }

        if ($this->has('member_names') && is_string($this->input('member_names'))) {
            $cleanedMembers = trim($this->input('member_names'));
            $this->merge(['member_names' => $cleanedMembers === '' ? null : $cleanedMembers]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'group_name' => ['required', 'string', 'min:2', 'max:35'],
            'member_names' => ['nullable', 'string', 'max:400'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'group_name.required' => 'Ilagay ang bagong pangalan ng pangkat.',
            'group_name.min' => 'Ang pangalan ng pangkat ay dapat may hindi bababa sa 2 letra.',
            'group_name.max' => 'Ang pangalan ng pangkat ay hanggang 35 karakter lamang.',
            'member_names.max' => 'Ang listahan ng mga miyembro ay hanggang 400 karakter lamang.',
        ];
    }
}
